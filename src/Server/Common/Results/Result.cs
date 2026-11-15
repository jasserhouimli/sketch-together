namespace SketchTogether.Server.Common.Results;

/// <summary>
/// Represents an application error with a code and descriptive message.
/// </summary>
public sealed record Error(string Code, string Message)
{
    public static readonly Error None = new(string.Empty, string.Empty);
    public static Error NotFound(string message) => new("NotFound", message);
    public static Error Validation(string message) => new("Validation", message);
    public static Error Conflict(string message) => new("Conflict", message);
    public static Error Unauthorized(string message) => new("Unauthorized", message);
}

/// <summary>
/// Result pattern implementation for clean railway-oriented programming.
/// </summary>
public class Result
{
    protected Result(bool isSuccess, Error error)
    {
        if (isSuccess && error != Error.None)
            throw new InvalidOperationException("Successful result cannot have an error.");
        if (!isSuccess && error == Error.None)
            throw new InvalidOperationException("Failed result must have an error.");

        IsSuccess = isSuccess;
        Error = error;
    }

    public bool IsSuccess { get; }
    public bool IsFailure => !IsSuccess;
    public Error Error { get; }

    public static Result Ok() => new(true, Error.None);
    public static Result Fail(Error error) => new(false, error);
    public static Result Fail(string message) => new(false, Error.Validation(message));
}

/// <summary>
/// Generic typed result pattern implementation.
/// </summary>
public sealed class Result<T> : Result
{
    private readonly T? _value;

    private Result(T value) : base(true, Error.None)
    {
        _value = value;
    }

    private Result(Error error) : base(false, error)
    {
        _value = default;
    }

    public T Value => IsSuccess
        ? _value!
        : throw new InvalidOperationException($"Cannot access Value of failed result: {Error.Message}");

    public static Result<T> Ok(T value) => new(value);
    public new static Result<T> Fail(Error error) => new(error);
    public new static Result<T> Fail(string message) => new(Error.Validation(message));

    public static implicit operator Result<T>(T value) => Ok(value);
    public static implicit operator Result<T>(Error error) => Fail(error);
}
