namespace SketchTogether.Server.Modules.Boards.Features.CreateBoard;

/// <summary>
/// Response payload for a newly created board containing its shareable id and unique edit key.
/// </summary>
public sealed record CreateBoardResponse(string Id, string EditKey);
