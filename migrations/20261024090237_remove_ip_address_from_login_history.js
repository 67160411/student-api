// migrations/<timestamp>_remove_ip_address_from_login_history.js
exports.up = function (knex) {
  return knex.schema.alterTable("login_history", (table) => {
    table.dropColumn("ip_address");
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable("login_history", (table) => {
    table.string("ip_address", 45).nullable();
  });
};
