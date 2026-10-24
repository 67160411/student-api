// migrations/<timestamp>_add_index_to_login_history.js
exports.up = function (knex) {
  return knex.schema.alterTable("login_history", (table) => {
    table.index("student_id", "idx_login_history_student_id");
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable("login_history", (table) => {
    table.dropIndex("student_id", "idx_login_history_student_id");
  });
};
