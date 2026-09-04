using MisterVpn.Domain;

namespace MisterVpn.UnitTests;

public sealed class ConnectionStateMachineTests
{
    [Fact]
    public void HappyPathReachesConnectedAndReturnsToDisconnected()
    {
        var machine = new ConnectionStateMachine();
        machine.TransitionTo(ConnectionState.Preparing);
        machine.TransitionTo(ConnectionState.Connecting);
        machine.TransitionTo(ConnectionState.Connected);
        machine.TransitionTo(ConnectionState.Disconnecting);
        machine.TransitionTo(ConnectionState.Disconnected);
        Assert.Equal(ConnectionState.Disconnected, machine.State);
    }

    [Fact]
    public void ConflictingTransitionIsRejected()
    {
        var machine = new ConnectionStateMachine();
        var error = Assert.Throws<InvalidOperationException>(() => machine.TransitionTo(ConnectionState.Connected));
        Assert.Contains("Disconnected -> Connected", error.Message);
    }

    [Fact]
    public void FaultCanBeResetSafely()
    {
        var machine = new ConnectionStateMachine();
        machine.TransitionTo(ConnectionState.Preparing);
        machine.TransitionTo(ConnectionState.Faulted);
        machine.TransitionTo(ConnectionState.Disconnected);
        Assert.Equal(ConnectionState.Disconnected, machine.State);
    }
}
