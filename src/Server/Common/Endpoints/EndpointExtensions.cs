using System.Reflection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace SketchTogether.Server.Common.Endpoints;

/// <summary>
/// Extension methods for discovering and mapping Minimal API endpoints.
/// </summary>
public static class EndpointExtensions
{
    /// <summary>
    /// Scans the specified assemblies and registers all <see cref="IEndpoint"/> implementations as transient services.
    /// </summary>
    public static IServiceCollection AddEndpoints(this IServiceCollection services, params Assembly[] assemblies)
    {
        if (assemblies.Length == 0)
        {
            assemblies = [Assembly.GetExecutingAssembly()];
        }

        var endpointTypes = assemblies
            .SelectMany(a => a.GetTypes())
            .Where(t => !t.IsAbstract && !t.IsInterface && typeof(IEndpoint).IsAssignableFrom(t));

        foreach (var type in endpointTypes)
        {
            services.TryAddEnumerable(ServiceDescriptor.Transient(typeof(IEndpoint), type));
        }

        return services;
    }

    /// <summary>
    /// Maps all registered <see cref="IEndpoint"/> implementations to the endpoint route builder.
    /// </summary>
    public static IEndpointRouteBuilder MapEndpoints(this IEndpointRouteBuilder app)
    {
        var endpoints = app.ServiceProvider.GetServices<IEndpoint>();
        foreach (var endpoint in endpoints)
        {
            endpoint.MapEndpoint(app);
        }

        return app;
    }
}
