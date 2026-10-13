using System.Security.Cryptography;

namespace SketchTogether.Server.Features.Boards;

/// <summary>Shareable room IDs: 12 lowercase alphanumerics (no look-alikes).</summary>
public static class BoardIds
{
    private const string Alphabet = "abcdefghjkmnpqrstuvwxyz23456789";

    public static string Generate()
    {
        var bytes = RandomNumberGenerator.GetBytes(12);
        return string.Concat(bytes.Select(b => Alphabet[b % Alphabet.Length]));
    }

    public static bool IsValid(string? id) =>
        id is { Length: 12 } && id.All(c => Alphabet.Contains(c));
}
