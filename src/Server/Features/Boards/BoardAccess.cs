using System.Security.Cryptography;
using System.Text;

namespace SketchTogether.Server.Features.Boards;

/// <summary>
/// Board edit capabilities. The public view link is the board id; changing the
/// board needs a separate high-entropy key that travels only in the edit link.
/// Only a SHA-256 hash of that key is stored, so the database never holds a
/// usable edit link.
/// </summary>
public static class BoardAccess
{
    /// <summary>256 bits of entropy, rendered as lowercase hex.</summary>
    public const int EditKeyBytes = 32;

    public const int EditKeyLength = EditKeyBytes * 2;

    /// <summary>SHA-256 as lowercase hex.</summary>
    public const int HashLength = 64;

    public static string GenerateEditKey() =>
        Convert.ToHexString(RandomNumberGenerator.GetBytes(EditKeyBytes)).ToLowerInvariant();

    public static string HashEditKey(string editKey) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(editKey))).ToLowerInvariant();

    /// <summary>True for a well-formed generated key (lowercase hex, exact length).</summary>
    public static bool IsEditKey(string? editKey) =>
        editKey is { Length: EditKeyLength } && editKey.All(char.IsAsciiHexDigitLower);

    /// <summary>
    /// Constant-time check of a presented key against a stored hash. Malformed
    /// input is rejected before hashing so it cannot be used to probe timing.
    /// </summary>
    public static bool Verify(string? presentedKey, string? storedHash)
    {
        if (presentedKey is null || !IsEditKey(presentedKey)) return false;
        if (storedHash is not { Length: HashLength }) return false;
        if (!storedHash.All(char.IsAsciiHexDigit)) return false;

        var computed = HashEditKey(presentedKey);
        return CryptographicOperations.FixedTimeEquals(
            Encoding.ASCII.GetBytes(computed),
            Encoding.ASCII.GetBytes(storedHash.ToLowerInvariant()));
    }
}
