using System.Diagnostics;
using System.Drawing;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Sockets;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text.Json;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace PresentationOS.DesktopHost;

static class Program
{
    [DllImport("kernel32.dll", SetLastError = true)] private static extern bool AttachConsole(int processId);
    private static Process? _sidecar;
    private static int _port;
    private static readonly string Token = Convert.ToHexString(RandomNumberGenerator.GetBytes(32)).ToLowerInvariant();
    internal static readonly string DataRoot = Path.GetFullPath(Environment.GetEnvironmentVariable("PRES_DATA_DIR")
        ?? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "PresentationOS", "data"));
    private static string Version => typeof(Program).Assembly.GetCustomAttribute<AssemblyInformationalVersionAttribute>()?.InformationalVersion ?? "unknown";
    internal static Uri WebUri => new($"http://127.0.0.1:{_port}/#session={Token}");

    [STAThread]
    static int Main(string[] args)
    {
        if (AttachConsole(-1)) {
            Console.SetOut(new StreamWriter(Console.OpenStandardOutput()) { AutoFlush = true });
            Console.SetError(new StreamWriter(Console.OpenStandardError()) { AutoFlush = true });
        }
        if (args.Contains("--version") || args.Contains("-v")) { Console.WriteLine($"PresentationOS Desktop {Version}"); return 0; }
        bool bootTest = args.Contains("--test-boot");
        try {
            EnsureSidecarRunning();
            if (!WaitForSidecarReady(20).GetAwaiter().GetResult()) throw new InvalidOperationException("Bundled sidecar failed authenticated startup. See the data directory logs.");
            if (bootTest) {
                WriteBootReport(true, null);
                Console.WriteLine("Authenticated bundled sidecar bootstrap passed. WebView2 and clean-machine verification were not attempted.");
                return 0;
            }
            ApplicationConfiguration.Initialize();
            Application.Run(new MainForm());
            return 0;
        } catch (Exception ex) {
            Console.Error.WriteLine(ex.Message);
            if (bootTest) WriteBootReport(false, ex.Message);
            else MessageBox.Show(ex.Message, "PresentationOS startup failed", MessageBoxButtons.OK, MessageBoxIcon.Error);
            return 1;
        } finally { CleanupSidecar(); }
    }

    private static void WriteBootReport(bool success, string? error)
    {
        var output = Environment.GetEnvironmentVariable("PRES_BOOT_REPORT");
        if (string.IsNullOrEmpty(output)) return;
        var record = new { bootstrapPassed = success, version = Version, dataRoot = DataRoot, port = _port,
            ownedSidecarPid = _sidecar?.Id, cleanMachine = "NOT_VERIFIED", webView = "NOT_ATTEMPTED", error };
        File.WriteAllText(output, JsonSerializer.Serialize(record, new JsonSerializerOptions { WriteIndented = true }));
    }

    internal static void EnsureSidecarRunning()
    {
        if (_sidecar != null) throw new InvalidOperationException("An owned sidecar is already running.");
        var bundle = AppContext.BaseDirectory;
        var script = Path.Combine(bundle, "dist-server", "sidecar-server.js");
        var node = Path.Combine(bundle, "runtime", "node.exe");
        if (!File.Exists(script) || !File.Exists(node)) throw new FileNotFoundException("Incomplete bundle: bundled runtime/node.exe and dist-server/sidecar-server.js are required.");
        Directory.CreateDirectory(DataRoot);
        var logDirectory = Path.Combine(DataRoot, "logs"); Directory.CreateDirectory(logDirectory);
        var listener = new TcpListener(IPAddress.Loopback, 0);
        listener.Start(); _port = ((IPEndPoint)listener.LocalEndpoint).Port; listener.Stop();
        var start = new ProcessStartInfo(node) {
            WorkingDirectory = bundle, UseShellExecute = false, CreateNoWindow = true,
            RedirectStandardOutput = true, RedirectStandardError = true,
        };
        start.ArgumentList.Add(script);
        start.Environment["PRES_PORT"] = _port.ToString(); start.Environment["PRES_SESSION_TOKEN"] = Token;
        start.Environment["PRES_DATA_DIR"] = DataRoot; start.Environment["PRES_SCHEMA_DIR"] = Path.Combine(bundle, "schemas");
        start.Environment["PATH"] = Path.Combine(bundle, "runtime") + Path.PathSeparator + Environment.GetEnvironmentVariable("PATH");
        start.Environment.Remove("NODE_PATH"); start.Environment.Remove("NODE_OPTIONS");
        var log = Path.Combine(logDirectory, $"sidecar-{DateTime.UtcNow:yyyyMMdd-HHmmss}-{Environment.ProcessId}.log");
        object logLock = new();
        void Append(string? line) { if (line != null) lock (logLock) File.AppendAllText(log, line + Environment.NewLine); }
        _sidecar = new Process { StartInfo = start };
        _sidecar.OutputDataReceived += (_, e) => Append(e.Data); _sidecar.ErrorDataReceived += (_, e) => Append(e.Data);
        if (!_sidecar.Start()) throw new InvalidOperationException("Could not start bundled Node runtime.");
        _sidecar.BeginOutputReadLine(); _sidecar.BeginErrorReadLine();
    }

    internal static async Task<bool> WaitForSidecarReady(int seconds)
    {
        using var client = new HttpClient { Timeout = TimeSpan.FromSeconds(1) };
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", Token);
        for (int i = 0; i < seconds * 10; i++) {
            if (_sidecar == null || _sidecar.HasExited) return false;
            try {
                using var response = await client.GetAsync($"http://127.0.0.1:{_port}/api/session");
                if (response.IsSuccessStatusCode) {
                    using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
                    if (json.RootElement.TryGetProperty("dataRoot", out var root) && string.Equals(Path.GetFullPath(root.GetString()!), DataRoot, StringComparison.OrdinalIgnoreCase)) return true;
                }
            } catch (HttpRequestException) { } catch (TaskCanceledException) { }
            await Task.Delay(100);
        }
        return false;
    }

    internal static void CleanupSidecar()
    {
        var owned = _sidecar; _sidecar = null;
        if (owned == null) return;
        try { if (!owned.HasExited) { owned.Kill(entireProcessTree: true); owned.WaitForExit(5000); } }
        finally { owned.Dispose(); }
    }
}

public class MainForm : Form
{
    private readonly WebView2 _webView;
    public MainForm()
    {
        Text = "PresentationOS Desktop Workbench"; Width = 1366; Height = 840;
        MinimumSize = new Size(1024, 700); StartPosition = FormStartPosition.CenterScreen;
        BackColor = ColorTranslator.FromHtml("#0b0f19");
        AccessibleName = "PresentationOSMainWindow"; AccessibleRole = AccessibleRole.Window;
        _webView = new WebView2 { Dock = DockStyle.Fill, AccessibleName = "PresentationOSWebView", AccessibleRole = AccessibleRole.Client };
        Controls.Add(_webView); Shown += (_, _) => InitWebView();
    }
    private async void InitWebView()
    {
        try {
            var cache = Path.Combine(Program.DataRoot, "webview2-cache"); Directory.CreateDirectory(cache);
            var environment = await CoreWebView2Environment.CreateAsync(null, cache);
            await _webView.EnsureCoreWebView2Async(environment); _webView.Source = Program.WebUri;
        } catch (Exception ex) {
            MessageBox.Show($"WebView2 initialization failed: {ex.Message}. Install Microsoft Edge WebView2 Runtime if it is unavailable.", "PresentationOS Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
            Close();
        }
    }
    protected override void OnFormClosed(FormClosedEventArgs e) { _webView.Dispose(); base.OnFormClosed(e); }
}
