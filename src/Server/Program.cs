using Microsoft.EntityFrameworkCore;
using SketchTogether.Server.Features.Boards;

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddDbContext<BoardsDbContext>(o =>
    o.UseSqlite(builder.Configuration.GetConnectionString("Boards") ?? "Data Source=boards.db"));
builder.Services.AddSignalR();
var app = builder.Build();

using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<BoardsDbContext>();
    db.Database.EnsureCreated();
}

app.MapGet("/health", () => Results.Ok(new { status = "ok", time = DateTimeOffset.UtcNow }));

app.MapPost("/api/boards", async (BoardsDbContext db, CancellationToken ct) =>
{
    var board = new Board { Id = BoardIds.Generate() };
    db.Boards.Add(board);
    await db.SaveChangesAsync(ct);
    return Results.Created($"/api/boards/{board.Id}", new { board.Id });
});

app.MapGet("/api/boards/{id}", async (string id, BoardsDbContext db, CancellationToken ct) =>
{
    if (!BoardIds.IsValid(id))
        return Results.BadRequest(new { error = "Board id must be 12 lowercase letters/digits." });
    var row = await db.Boards.FindAsync([id], ct);
    if (row is null)
        return Results.NotFound(new { error = "No board with that link. Check the URL or create a new board." });
    return Results.Ok(BoardDto.From(row));
});

app.MapHub<BoardHub>("/hubs/board");

app.Run();
