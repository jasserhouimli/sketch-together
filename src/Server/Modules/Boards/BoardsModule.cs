using Microsoft.EntityFrameworkCore;
using SketchTogether.Server.Common.Endpoints;
using SketchTogether.Server.Modules.Boards.Features.CreateBoard;
using SketchTogether.Server.Modules.Boards.Features.GetBoard;
using SketchTogether.Server.Modules.Boards.Infrastructure;

namespace SketchTogether.Server.Modules.Boards;

public static class BoardsModule
{
    public static IServiceCollection AddBoardsModule(this IServiceCollection services, IConfiguration configuration)
    {
        services.AddDbContext<BoardsDbContext>(options =>
            options.UseSqlite(configuration.GetConnectionString("Boards") ?? "Data Source=boards.db"));

        // Register handlers for vertical slices
        services.AddScoped<CreateBoardHandler>();
        services.AddScoped<GetBoardHandler>();

        // Register slice endpoints
        services.AddTransient<IEndpoint, CreateBoardEndpoint>();
        services.AddTransient<IEndpoint, GetBoardEndpoint>();

        return services;
    }

    public static IApplicationBuilder UseBoardsModule(this IApplicationBuilder app)
    {
        using var scope = app.ApplicationServices.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<BoardsDbContext>();
        db.Database.EnsureCreated();
        BoardSchema.EnsureEditKeyColumn(db);

        return app;
    }
}
