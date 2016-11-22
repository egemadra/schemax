"use strict";

var pgClient = require("pg").Client;
var util = require("./util.js");
var co = require("co");

module.exports = {

  extract: (options) => {

    return co(function *(){

      var client = new pgClient(options);
      var conn = yield util.promisifyCall(client.connect, client);

      //var conn = client.connect();
      var schema = {
        vendor: "pg",
        database: options.database,
        tableCount: 0,
        tables: {},
      };

      //tables:
      var q = "SELECT * FROM information_schema.tables WHERE table_schema='public'";
      var rows = (yield conn.query(q)).rows;

      schema.tableCount = rows.length;

      for (var t of rows) {
        schema.tables[t.table_name] = {
          name: t.table_name,
          pks: [],
          columnCount: 0,
          columns: {},
          indexes: {},
          foreignKeys: {},
        }
      }

      //columns:
      q = "SELECT * FROM  information_schema.columns WHERE table_schema = 'public'";
      rows = (yield conn.query(q)).rows;
      for (var c of rows) {
        var table = schema.tables[c.table_name];
        table.columnCount++;
        table.columns[c.column_name] = {
          name: c.column_name,
          position: c.ordinal_position,
          default: c.column_default, //'778::numeric'?
          nullable : c.is_nullable === 'YES',
          type: c.data_type,
          lengthInChars: c.character_maximum_length,
          lengthInBytes: c.character_octet_length,
        }
      }

      //foreign keys: This is not as straightforward in pg:
      //http://stackoverflow.com/questions/1152260/postgres-sql-to-list-table-foreign-keys#17164614
      q=`select c.constraint_name
            , x.table_schema as schema_name
            , x.table_name
            , x.column_name
            , y.table_schema as foreign_schema_name
            , y.table_name as foreign_table_name
            , y.column_name as foreign_column_name
            , rc.update_rule, rc.delete_rule
        from information_schema.referential_constraints c
        join information_schema.key_column_usage x
            on x.constraint_name = c.constraint_name
        join information_schema.key_column_usage y
            on y.ordinal_position = x.position_in_unique_constraint
            and y.constraint_name = c.unique_constraint_name
        join information_schema.referential_constraints rc
            on rc.constraint_name = c.constraint_name
        where c.constraint_schema = 'public'
        order by c.constraint_name, x.ordinal_position`;
      rows = (yield conn.query(q)).rows;

      for (var r of rows) {
        var foreignKeys = schema.tables[r.table_name].foreignKeys;
        var fk = foreignKeys[r.constraint_name];
        if (!fk) fk = foreignKeys[r.constraint_name] = {
          toTable: r.foreign_table_name,
          update: r.update_rule,
          delete : r.delete_rule,
          columns: [],
        };

        fk.columns.push({
          name: r.column_name,
          toColumn: r.foreign_column_name,
        });
      }

      //indexes:
      q = `select
      tc.constraint_name, tc.constraint_type, tc.table_name,
      kcu.column_name
      from information_schema.table_constraints tc
      join information_schema.key_column_usage kcu
        on kcu.constraint_name = tc.constraint_name
        and kcu.table_name = tc.table_name
        and kcu.constraint_schema = tc.constraint_schema
      where tc.constraint_schema = 'public'`;
      rows = (yield conn.query(q)).rows;

      for (var r of rows) {
        var indexes = schema.tables[r.table_name].indexes;
        var index = indexes[r.constraint_name];
        if (!index) index = indexes[r.constraint_name] = {
          name: r.constraint_name,
          type: r.constraint_type,
          unique: r.constraint_type != 'FOREIGN KEY',
          columns: [],
        }

        if (index.type === 'PRIMARY KEY') {
          schema.tables[r.table_name].pks.push(r.column_name);
        }

        index.columns.push(r.column_name);
      }

      //other indexes which cannot be obtained by schema but pg specific meta:
      //http://stackoverflow.com/questions/6777456/list-all-index-names-column-names-and-its-table-name-of-a-postgresql-database#6777904
      //to extract column names as json:
      //http://stackoverflow.com/questions/3068683/convert-postgresql-array-to-php-array#13670706
      q = `
      SELECT i.relname as indname,
       i.relowner as indowner,
       idx.indrelid::regclass,
       am.amname as indam,
       idx.indkey,
       array_to_json(
         ARRAY(
           SELECT pg_get_indexdef(idx.indexrelid, k + 1, true)
           FROM generate_subscripts(idx.indkey, 1) as k
           ORDER BY k
         )
       ) as indkey_names,
       idx.indexprs IS NOT NULL as indexprs,
       idx.indpred IS NOT NULL as indpred
      FROM   pg_index as idx
      JOIN   pg_class as i
      ON     i.oid = idx.indexrelid
      JOIN   pg_am as am
      ON     i.relam = am.oid
      JOIN   pg_namespace as ns
      ON     ns.oid = i.relnamespace
      AND    ns.nspname = ANY(current_schemas(false))`
      rows = (yield conn.query(q)).rows;
      for (var r of rows) {
        var tableName = r.indrelid.substr(1, r.indrelid.length - 2);
        if (!schema.tables[tableName].indexes[r.indname]){
          schema.tables[tableName].indexes[r.indname] = {
            name: r.indname,
            type: 'INDEX',
            unique: false,
            columns: r.indkey_names,
          }
        }
      }

      conn.end();
      return schema;
    });
  }
}
