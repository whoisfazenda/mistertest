namespace MisterVpnMobile;

public partial class MainPage : ContentPage
{
    private bool _connected;

    public MainPage()
    {
        InitializeComponent();
    }

    private void OnConnectClicked(object sender, EventArgs e)
    {
        _connected = !_connected;

        StatusLabel.Text = _connected ? "ONLINE" : "OFFLINE";
        PingLabel.Text = _connected ? "38" : "--";
        StateLabel.Text = _connected ? "SAFE" : "READY";
        UptimeLabel.Text = _connected ? "00H 03M 42S" : "00H 00M 00S";
        ConnectButton.BorderColor = _connected ? Color.FromArgb("#FFFFFF") : Color.FromArgb("#333333");
        ConnectButton.TextColor = _connected ? Color.FromArgb("#FFFFFF") : Color.FromArgb("#E8E8E8");
        LogLabel.Text = _connected
            ? $"[{DateTime.Now:HH:mm:ss}] TUNNEL ONLINE."
            : $"[{DateTime.Now:HH:mm:ss}] TUNNEL OFFLINE.";
    }

    private void OnConfigClicked(object sender, EventArgs e)
    {
        ConfigPanel.IsVisible = !ConfigPanel.IsVisible;
    }

    private void OnSaveClicked(object sender, EventArgs e)
    {
        LogLabel.Text = $"[{DateTime.Now:HH:mm:ss}] CONFIG SAVED.";
    }
}
