using SketchTogether.Server.Common.Endpoints;

namespace SketchTogether.Server.Modules.Boards.Features.CreateBoard;

public sealed class CreateBoardEndpoint : IEndpoint
{
    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        app.MapPost("/api/boards", async (CreateBoardHandler handler, CancellationToken ct) =>
        {
            var result = await handler.HandleAsync(ct);
            return Results.Created($"/api/boards/{result.Value.Id}", result.Value);
        })
        .WithName("CreateBoard")
        .WithSummary("Creates a new collaborative board")
        .WithDescription("Generates a new board ID and a high-entropy edit key returned only once.")
        .Produces<CreateBoardResponse>(StatusCodes.Status201Created);
    }
}
