// migrations/<timestamp>_add_client_ip_to_login_history.js
exports.up = function (knex) {
  return knex.schema.alterTable("login_history", (table) => {
    table.string("client_ip", 45).nullable();
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable("login_history", (table) => {
    table.dropColumn("client_ip");
  });
};
