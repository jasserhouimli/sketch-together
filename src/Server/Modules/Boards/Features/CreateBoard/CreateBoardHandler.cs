using SketchTogether.Server.Common.Results;
using SketchTogether.Server.Modules.Boards.Domain;
using SketchTogether.Server.Modules.Boards.Infrastructure;

namespace SketchTogether.Server.Modules.Boards.Features.CreateBoard;

/// <summary>
/// Handles board creation logic, generating secure identifiers and keys.
/// </summary>
public sealed class CreateBoardHandler(BoardsDbContext db)
{
    public async Task<Result<CreateBoardResponse>> HandleAsync(CancellationToken ct = default)
    {
        // The key is returned once, in the create response. Only its hash is
        // stored, so the edit link cannot be recovered from the database.
        var editKey = BoardAccess.GenerateEditKey();
        var board = new Board
        {
            Id = BoardIds.Generate(),
            EditKeyHash = BoardAccess.HashEditKey(editKey),
        };

        db.Boards.Add(board);
        await db.SaveChangesAsync(ct);

        return Result<CreateBoardResponse>.Ok(new CreateBoardResponse(board.Id, editKey));
    }
}
