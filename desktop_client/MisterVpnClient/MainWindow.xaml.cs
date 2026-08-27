using System.Windows;
using System.Windows.Controls.Primitives;
using System.Windows.Input;
using System.Windows.Media;
using MisterVpnClient.Services;

namespace MisterVpnClient;

public partial class MainWindow : Window
{
    private readonly VpnConnectionService _connection = new();
    private readonly AppSettings _settings;
    private CancellationTokenSource? _connectCts;
    private bool _isBusy;

    public MainWindow()
    {
        InitializeComponent();
        _settings = AppSettings.Load();
        SubscriptionBox.Text = _settings.Subscription;
        SystemProxyCheckBox.IsChecked = _settings.EnableSystemProxy;
        AddLog("READY. PASTE SUBSCRIPTION URL IN CONFIG AND PRESS I/O.");
        SetConnected(false);
    }

    private async void PowerButton_Click(object sender, RoutedEventArgs e)
    {
        if (_isBusy)
        {
            return;
        }

        if (_connection.IsConnected)
        {
            Disconnect();
            return;
        }

        await ConnectAsync();
    }

    private async Task ConnectAsync()
    {
        SaveSettings();
        SetBusy(true);
        _connectCts = new CancellationTokenSource();

        try
        {
            await _connection.ConnectAsync(
                SubscriptionBox.Text,
                SystemProxyCheckBox.IsChecked == true,
                AddLog,
                _connectCts.Token);
            PingText.Text = "38 ms";
            SetConnected(true);
        }
        catch (OperationCanceledException)
        {
            AddLog("CONNECTION CANCELED.");
            SetConnected(false);
        }
        catch (Exception ex)
        {
            AddLog($"ERROR: {ex.Message}");
            SubscriptionPanel.Visibility = Visibility.Visible;
            SetConnected(false);
        }
        finally
        {
            SetBusy(false);
        }
    }

    private void Disconnect()
    {
        _connectCts?.Cancel();
        _connection.Disconnect(AddLog);
        SetConnected(false);
    }

    private void SaveButton_Click(object sender, RoutedEventArgs e)
    {
        SaveSettings();
        AddLog("CONFIG SAVED.");
    }

    private void TogglePanelButton_Click(object sender, RoutedEventArgs e)
    {
        var showConfig = SubscriptionPanel.Visibility != Visibility.Visible;
        SubscriptionPanel.Visibility = showConfig ? Visibility.Visible : Visibility.Collapsed;
        QuickControlsPanel.Visibility = showConfig ? Visibility.Collapsed : Visibility.Visible;
    }

    private void SaveSettings()
    {
        _settings.Subscription = SubscriptionBox.Text.Trim();
        _settings.EnableSystemProxy = SystemProxyCheckBox.IsChecked == true;
        _settings.Save();
    }

    private void SetBusy(bool busy)
    {
        _isBusy = busy;
        PowerIcon.Text = busy ? "..." : "I/O";
        StatusText.Text = busy ? "CONNECTING" : StatusText.Text;
        PowerButton.IsEnabled = !busy;
    }

    private void SetConnected(bool connected)
    {
        StatusText.Text = connected ? "ONLINE" : "OFFLINE";
        PingText.Text = connected ? PingText.Text : " -- ms";
        PowerIcon.Foreground = BrushFrom(connected ? "#FFFFFF" : "#999999");
        PowerButton.Background = BrushFrom(connected ? "#111111" : "#050505");
        PowerButton.BorderBrush = BrushFrom(connected ? "#FFFFFF" : "#333333");
        ServerText.Foreground = BrushFrom(connected ? "#FFFFFF" : "#E8E8E8");
    }

    private void AddLog(string message)
    {
        Dispatcher.Invoke(() =>
        {
            LogBox.AppendText($"[{DateTime.Now:HH:mm:ss}] {message}{Environment.NewLine}");
            LogBox.ScrollToEnd();
        });
    }

    private void WindowDrag_MouseLeftButtonDown(object sender, MouseButtonEventArgs e)
    {
        if (e.LeftButton == MouseButtonState.Pressed)
        {
            DragMove();
        }
    }

    private void MinimizeButton_Click(object sender, RoutedEventArgs e) => WindowState = WindowState.Minimized;

    private void MaximizeButton_Click(object sender, RoutedEventArgs e)
    {
        WindowState = WindowState == WindowState.Maximized ? WindowState.Normal : WindowState.Maximized;
    }

    private void CloseButton_Click(object sender, RoutedEventArgs e) => Close();

    private void ResizeThumb_DragDelta(object sender, DragDeltaEventArgs e)
    {
        Width = Math.Max(MinWidth, Width + e.HorizontalChange);
        Height = Math.Max(MinHeight, Height + e.VerticalChange);
    }

    protected override void OnClosed(EventArgs e)
    {
        if (_connection.IsConnected)
        {
            _connection.Disconnect(_ => { });
        }

        base.OnClosed(e);
    }

    private static SolidColorBrush BrushFrom(string color) =>
        new((Color)ColorConverter.ConvertFromString(color));
}
