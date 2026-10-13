using Microsoft.EntityFrameworkCore;

namespace SketchTogether.Server.Features.Boards;

public sealed class BoardsDbContext(DbContextOptions<BoardsDbContext> options) : DbContext(options)
{
    public DbSet<Board> Boards => Set<Board>();

    protected override void OnModelCreating(ModelBuilder b)
    {
        b.Entity<Board>(e =>
        {
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasMaxLength(32).IsRequired();
            e.Property(x => x.ItemsJson).IsRequired();
        });
    }
}
