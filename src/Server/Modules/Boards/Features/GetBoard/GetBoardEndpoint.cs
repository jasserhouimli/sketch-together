using SketchTogether.Server.Common.Endpoints;

namespace SketchTogether.Server.Modules.Boards.Features.GetBoard;

public sealed class GetBoardEndpoint : IEndpoint
{
    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        app.MapGet("/api/boards/{id}", async (string id, GetBoardHandler handler, CancellationToken ct) =>
        {
            var result = await handler.HandleAsync(id, ct);
            if (result.IsFailure)
            {
                return result.Error.Code switch
                {
                    "Validation" => Results.BadRequest(new { error = result.Error.Message }),
                    "NotFound" => Results.NotFound(new { error = result.Error.Message }),
                    _ => Results.Problem(result.Error.Message)
                };
            }

            return Results.Ok(result.Value);
        })
        .WithName("GetBoard")
        .WithSummary("Gets board content by ID")
        .WithDescription("Retrieves the persisted items for a specific board.")
        .Produces<BoardDto>(StatusCodes.Status200OK)
        .Produces(StatusCodes.Status400BadRequest)
        .Produces(StatusCodes.Status404NotFound);
    }
}
