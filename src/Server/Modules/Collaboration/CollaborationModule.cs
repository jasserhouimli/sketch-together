using SketchTogether.Server.Modules.Collaboration.Contracts;
using SketchTogether.Server.Modules.Collaboration.Domain;
using SketchTogether.Server.Modules.Collaboration.Hubs;
using SketchTogether.Server.Modules.Collaboration.Services;

namespace SketchTogether.Server.Modules.Collaboration;

public static class CollaborationModule
{
    public static IServiceCollection AddCollaborationModule(this IServiceCollection services)
    {
        services.AddSignalR();
        services.AddSingleton<IBoardLockManager, InMemoryBoardLockManager>();
        services.AddSingleton<IBoardPresenceTracker, BoardPresence>();
        services.AddSingleton<IActionDeduplicator, InMemoryActionDeduplicator>();

        return services;
    }

    public static IEndpointRouteBuilder MapCollaborationModule(this IEndpointRouteBuilder app)
    {
        app.MapHub<BoardHub>("/hubs/board");
        return app;
    }
}
