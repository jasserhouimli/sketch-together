namespace SketchTogether.Server.Common.Endpoints;

/// <summary>
/// Defines an endpoint mapping contract for Minimal APIs in Vertical Slice Architecture.
/// </summary>
public interface IEndpoint
{
    /// <summary>
    /// Maps the route and handler to the application route builder.
    /// </summary>
    void MapEndpoint(IEndpointRouteBuilder app);
}
