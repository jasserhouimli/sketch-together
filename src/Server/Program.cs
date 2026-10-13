using Microsoft.EntityFrameworkCore;
using SketchTogether.Server.Features.Boards;

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddDbContext<BoardsDbContext>(o =>
    o.UseSqlite(builder.Configuration.GetConnectionString("Boards") ?? "Data Source=boards.db"));
var app = builder.Build();

using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<BoardsDbContext>();
    db.Database.EnsureCreated();
}

app.MapGet("/health", () => Results.Ok(new { status = "ok", time = DateTimeOffset.UtcNow }));

app.Run();
