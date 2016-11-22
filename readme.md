# Schemax

Schemax is a schema extractor for relational databases for node.js. It supports Mysql, Sqlite3 and PostgreSQL.

It reads your database schema and returns structure information about tables, columns, constraints and indexes. The information is presented is more or less the same for each of the supported databases.

## Installation

```
npm install schemax --save
```

> You will also need to install one of the following database bindings: mysql, postgres, sqlite3:

```
npm install mysql --save
npm install pg --save
npm install sqlite3 --save
```

If you cloned the project from the github repository, you need to install the dependencies listed on the package.json file.

## Usage and API:

The library currently defines only one API method:

- extract: expects an object representing connection information for a database and returns a promise resolving to the extracted data:

```javascript
var schemax = require("schemax");

/*
- adapter and database fields are required for every database.
- adapter is one of "mysql", "sqlite3" or "pg".
- database field should contain the name of the database for Mysql and PostgreSQL,
or the database file for Sqlite3. Other fields are optional for sqlite3.
- "public" schema is assumed for PostgreSQL.
*/
var options = {
  adapter: "mysql", //other options are "sqlite3" and "pg"
  host: "localhost",
  user: "someuser",  
  password: "somepassword",
  database: "TestDatabase",
}

schemax.extract(options)
  .then(schema => {
    console.log(require('util').inspect(schema, { depth: null }));
  })
  .catch(err => console.error("err: ", err));
```

For the explation of fields in returning object, please see below for the annotated example.

## Example:

Below is an Sqlite3 script to create a database. Note that TestTable is a convoluted example to demonstrate composite indexes, primary and foreign keys.

```SQL
CREATE TABLE "Group" (
  "id" integer NOT NULL PRIMARY KEY AUTOINCREMENT,
  "personId" integer NOT NULL,
  FOREIGN KEY ("personId") REFERENCES "Person" ("id") ON DELETE CASCADE ON UPDATE RESTRICT
);


CREATE TABLE "Person" (
  "id" integer NOT NULL PRIMARY KEY AUTOINCREMENT,
  "name" text NOT NULL,
  "lastName" text NOT NULL,
  "email" text NOT NULL,
  "extraInfo" text NULL
);

CREATE UNIQUE INDEX "Person_email" ON "Person" ("email");

CREATE INDEX "Person_name_lastName" ON "Person" ("name", "lastName");


CREATE TABLE "TestTable" (
  "id1" integer NOT NULL,
  "id2" integer NOT NULL,
  "c1" integer NOT NULL,
  "c2" integer NOT NULL,
  "uni1" integer NOT NULL,
  "c3" integer NULL,
  "uni2" integer NULL,
  "un3" integer NULL,
  PRIMARY KEY ("id1", "id2"),
  FOREIGN KEY ("c1", "c2") REFERENCES "Test" ("id1", "id2") ON DELETE NO ACTION ON UPDATE CASCADE,
  FOREIGN KEY ("c3") REFERENCES "Test" ("id1") ON DELETE SET NULL ON UPDATE RESTRICT
);

CREATE UNIQUE INDEX "Test_uni2_un3" ON "TestTable" ("uni2", "un3");

CREATE INDEX "Test_uni1_uni2" ON "TestTable" ("uni1", "uni2");

CREATE UNIQUE INDEX "Test_uni1" ON "TestTable" ("uni1");
```

Extract schema information and display as json:

```javascript
var schemax = require("schemax");

var options = {
  adapter: "sqlite3",
  database: "path/to/some/sqlite/database.sqlite",
}

schemax.extract(options)
  .then(schema => {
    console.log(require('util').inspect(schema, { depth: null }));
  })
  .catch(err => console.error("err: ", err));
```

The result is:

```javascript
{ vendor: 'sqlite3',
  database: './test/test.sqlite',
  tableCount: 3,
  tables:
   { TestTable:
      { name: 'TestTable',
        pks: [ 'id1', 'id2' ], //Names of the primary key columns.
        //Note that composite primary keys are supported.
        columnCount: 8,
        //Mysql tables also have a "comment" field which extracts the table comment.
        columns:
         { id1:
            { name: 'id1',
              position: 0,
              default: null, //default value of a column. null doesn't mean the
              //database NULL, it simply means no default value is defined
              //for the column.
              nullable: false,
              type: 'integer',
              /*           
              //varchar or equivalent text fields in Mysql and PostgreSQL also have
              //these fields:
              lengthInChars: 120,
              lengthInBytes: 360,
              */
              isPK: true, //is primary key? Doesn't appear on non-pk columns.
              isAI: true , //is auto-increment? Doesn't appear on non-pk columns.
              //Mysql output may also have a comment field here if a comment
              //for the column exists.
            },
           id2:
            { name: 'id2',
              position: 1,
              default: null,
              nullable: false,
              type: 'integer',
              isPK: true,
              isAI: false },
           c1:
            { name: 'c1',
              position: 2,
              default: null,
              nullable: false,              
              type: 'integer' },
           c2:
            { name: 'c2',
              position: 3,
              default: null,
              nullable: false,
              type: 'integer' },
           uni1:
            { name: 'uni1',
              position: 4,
              default: null,
              nullable: false,
              type: 'integer' },
           c3:
            { name: 'c3',
              position: 5,
              default: null,
              nullable: true,
              type: 'integer' },
           uni2:
            { name: 'uni2',
              position: 6,
              default: null,
              nullable: true,
              type: 'integer' },
           un3:
            { name: 'un3',
              position: 7,
              default: null,
              nullable: true,
              type: 'integer' } },
        indexes:  //Interestingly sqlite3 doesn't list PRIMARY KEYs in indexes
                  //when they consist of a single column.
         { Test_uni2_un3: //index name
            { name: 'Test_uni2_un3',
              type: 'UNIQUE', //one of UNIQUE, INDEX and PRIMARY KEY
              unique: true,
              columns: [ 'uni2', 'un3' ] }, //columns involved in the index
           Test_uni1_uni2:
            { name: 'Test_uni1_uni2',
              type: 'INDEX',
              unique: false,
              columns: [ 'uni1', 'uni2' ] },
           Test_uni1:
            { name: 'Test_uni1',
              type: 'UNIQUE',
              unique: true,
              columns: [ 'uni1' ] },
           sqlite_autoindex_TestTable_1: //composite primary key is displayed:
            { name: 'sqlite_autoindex_TestTable_1',
              type: 'PRIMARY KEY',
              unique: true,
              columns: [ 'id1', 'id2' ] } },
        foreignKeys:
         { '0': //For Mysql and PostgreSQL, the key of the field is the
                //constraint name. Sqlite3 doesn't seem to have this,
                //but it has "id"s, and they are used here as keys.
            { toTable: 'Test',
              update: 'RESTRICT', //update rule
              delete: 'SET NULL', //delete rule
              columns: [ { name: 'c3', toColumn: 'id1' } ] },
           '1':
            { toTable: 'Test',
              update: 'CASCADE',
              delete: 'NO ACTION',
              columns: //composite foreign keys are correctly listed:
               [ { name: 'c1', toColumn: 'id1' },
                 { name: 'c2', toColumn: 'id2' } ] } } },
     Person:
      { name: 'Person',
        pks: [ 'id' ],
        columnCount: 5,
        columns:
         { id:
            { name: 'id',
              position: 0,
              default: null,
              nullable: false,
              type: 'integer',
              isPK: true,
              isAI: true },
           name:
            { name: 'name',
              position: 1,
              default: null,
              nullable: false,
              type: 'text' },
           lastName:
            { name: 'lastName',
              position: 2,
              default: null,
              nullable: false,
              type: 'text' },
           email:
            { name: 'email',
              position: 3,
              default: null,
              nullable: false,
              type: 'text' },
           extraInfo:
            { name: 'extraInfo',
              position: 4,
              default: null,
              nullable: true,
              type: 'text' } },
        indexes:
         { Person_email:
            { name: 'Person_email',
              type: 'UNIQUE',
              unique: true,
              columns: [ 'email' ] },
           Person_name_lastName:
            { name: 'Person_name_lastName',
              type: 'INDEX',
              unique: false,
              columns: [ 'name', 'lastName' ] } },
        foreignKeys: {} },
     Group:
      { name: 'Group',
        pks: [ 'id' ],
        columnCount: 2,
        columns:
         { id:
            { name: 'id',
              position: 0,
              default: null,
              nullable: false,
              type: 'integer',
              isPK: true,
              isAI: true },
           personId:
            { name: 'personId',
              position: 1,
              default: null,
              nullable: false,
              type: 'integer' } },
        indexes: {},
        foreignKeys:
         { '0':
            { toTable: 'Person',
              update: 'RESTRICT',
              delete: 'CASCADE',
              columns: [ { name: 'personId', toColumn: 'id' } ] } } } } }
```

## Status and development

Schemax is built to aid the development of ["persistanz"](https://www.npmjs.com/package/persistanz) as an internal component. It can be considered alfa quality software with very little testing. That said, it does quite a small job so it is unlikely that it has too many major issues. If you have any ideas, bug reports or anything else please open a pull request on the github repository or contact me at egemadra@gmail.com.

## Version history

- v0.1.0 (2016-11-22) - Initial release.
