"use strict";
const schemax = require("../schemax");

const options = {
  adapter: "mysql2",
  host: "127.0.0.1",
  user: "root",
  password: "",
  database: "",
};

(async function () {
  const schema = await schemax.extract(options);
  console.dir(schema, {depth: null});    
})();



