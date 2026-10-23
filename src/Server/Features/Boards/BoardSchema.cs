using System.Data;
using Microsoft.EntityFrameworkCore;

namespace SketchTogether.Server.Features.Boards;

/// <summary>
/// Startup schema fixes for databases created before a column existed.
/// EnsureCreated only creates a missing database, so an existing boards.db
/// needs the edit-key column added explicitly.
/// </summary>
public static class BoardSchema
{
    /// <summary>
    /// Adds the nullable <c>EditKeyHash</c> column when an older SQLite database
    /// lacks it. Null means the board predates edit links and stays open; see
    /// <see cref="Board.EditKeyHash"/>. Idempotent.
    /// </summary>
    public static void EnsureEditKeyColumn(BoardsDbContext db)
    {
        if (!db.Database.IsSqlite()) return;

        var connection = db.Database.GetDbConnection();
        var openedHere = connection.State != ConnectionState.Open;
        if (openedHere) connection.Open();
        try
        {
            bool exists;
            using (var check = connection.CreateCommand())
            {
                check.CommandText = "PRAGMA table_info(\"Boards\");";
                using var reader = check.ExecuteReader();
                exists = false;
                while (reader.Read())
                {
                    if (string.Equals(reader.GetString(1), "EditKeyHash", StringComparison.OrdinalIgnoreCase))
                    {
                        exists = true;
                        break;
                    }
                }
            }
            if (exists) return;

            using var alter = connection.CreateCommand();
            alter.CommandText = "ALTER TABLE \"Boards\" ADD COLUMN \"EditKeyHash\" TEXT NULL";
            alter.ExecuteNonQuery();
        }
        finally
        {
            if (openedHere) connection.Close();
        }
    }
}
