using SketchTogether.Server.Common.Endpoints;
using SketchTogether.Server.Modules.Boards;
using SketchTogether.Server.Modules.Collaboration;

var builder = WebApplication.CreateBuilder(args);

// Register Core Infrastructure & Modules
builder.Services.AddEndpoints();
builder.Services.AddBoardsModule(builder.Configuration);
builder.Services.AddCollaborationModule();

var app = builder.Build();

// Static file hosting for production SPA
app.UseDefaultFiles();
app.UseStaticFiles();

// Database schema initialization
app.UseBoardsModule();

// System Health Check
app.MapGet("/health", () => Results.Ok(new { status = "ok", time = DateTimeOffset.UtcNow }))
   .WithName("HealthCheck")
   .WithTags("System");

// Map Minimal API Vertical Slices & SignalR Hubs
app.MapEndpoints();
app.MapCollaborationModule();

// SPA fallback
app.MapFallbackToFile("index.html");

app.Run();

// For WebApplicationFactory integration tests
public partial class Program { }
