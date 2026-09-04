using MisterVpn.Domain;

namespace MisterVpn.IntegrationTests;

public sealed class ArchitectureTests
{
    [Fact]
    public void DomainHasNoProjectDependencies()
    {
        var references = typeof(ConnectionState).Assembly.GetReferencedAssemblies();
        Assert.DoesNotContain(references, item => item.Name?.StartsWith("MisterVpn.", StringComparison.Ordinal) == true);
    }
}
