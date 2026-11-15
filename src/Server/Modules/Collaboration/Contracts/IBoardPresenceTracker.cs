using SketchTogether.Server.Modules.Collaboration.Domain;

namespace SketchTogether.Server.Modules.Collaboration.Contracts;

public interface IBoardPresenceTracker
{
    Participant Join(string boardId, string connectionId, string? requestedName, bool canEdit);
    string? Rename(string connectionId, string? requestedName);
    string? Leave(string connectionId);
    Membership? Find(string connectionId);
    IReadOnlyList<Participant> Roster(string boardId);
}
