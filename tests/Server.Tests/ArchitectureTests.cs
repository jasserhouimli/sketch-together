using System.Reflection;
using Microsoft.AspNetCore.SignalR;
using SketchTogether.Server.Common.Endpoints;

namespace Server.Tests;

public sealed class ArchitectureTests
{
    private static readonly Assembly ServerAssembly = typeof(IEndpoint).Assembly;

    [Fact]
    public void All_Endpoints_Must_Implement_IEndpoint_And_Be_Sealed()
    {
        var endpointTypes = ServerAssembly.GetTypes()
            .Where(t => t.Name.EndsWith("Endpoint", StringComparison.Ordinal) && !t.IsInterface && !t.IsAbstract)
            .ToList();

        Assert.NotEmpty(endpointTypes);
        foreach (var type in endpointTypes)
        {
            Assert.True(typeof(IEndpoint).IsAssignableFrom(type), $"{type.Name} should implement IEndpoint");
            Assert.True(type.IsSealed, $"{type.Name} should be sealed");
        }
    }

    [Fact]
    public void All_Handlers_Must_Be_Sealed()
    {
        var handlerTypes = ServerAssembly.GetTypes()
            .Where(t => t.Name.EndsWith("Handler", StringComparison.Ordinal) && !t.IsInterface && !t.IsAbstract)
            .ToList();

        Assert.NotEmpty(handlerTypes);
        foreach (var type in handlerTypes)
        {
            Assert.True(type.IsSealed, $"{type.Name} should be sealed");
        }
    }

    [Fact]
    public void BoardHub_Must_Be_Sealed_And_Inherit_From_Hub()
    {
        var hubType = typeof(BoardHub);

        Assert.True(hubType.IsSealed);
        Assert.True(typeof(Hub).IsAssignableFrom(hubType));
    }

    [Fact]
    public void Modules_Must_Have_No_Public_Static_Fields()
    {
        var moduleTypes = ServerAssembly.GetTypes()
            .Where(t => t.Namespace?.Contains(".Modules.") == true)
            .ToList();

        foreach (var type in moduleTypes)
        {
            if (type.Name.StartsWith("<>")) continue;

            var publicStaticFields = type.GetFields(BindingFlags.Public | BindingFlags.Static)
                .Where(f => !f.IsLiteral && !f.IsInitOnly && !f.Name.StartsWith("<>"))
                .ToList();

            Assert.Empty(publicStaticFields);
        }
    }
}
