using SketchTogether.Server.Common.Results;
using SketchTogether.Server.Modules.Boards.Domain;
using SketchTogether.Server.Modules.Boards.Infrastructure;

namespace SketchTogether.Server.Modules.Boards.Features.GetBoard;

public sealed class GetBoardHandler(BoardsDbContext db)
{
    public async Task<Result<BoardDto>> HandleAsync(string id, CancellationToken ct = default)
    {
        if (!BoardIds.IsValid(id))
        {
            return Result<BoardDto>.Fail(Error.Validation("Board id must be 12 lowercase letters/digits."));
        }

        var row = await db.Boards.FindAsync([id], ct);
        if (row is null)
        {
            return Result<BoardDto>.Fail(Error.NotFound("No board with that link. Check the URL or create a new board."));
        }

        return Result<BoardDto>.Ok(BoardDto.From(row));
    }
}
