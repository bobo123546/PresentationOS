using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net.Http;
using System.Runtime.InteropServices;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace PresentationOS.DesktopHost;

static class Program
{
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool AttachConsole(int dwProcessId);
    private const int ATTACH_PARENT_PROCESS = -1;

    private static Process? _sidecarProcess;
    private static readonly int SidecarPort = 48200;

    [STAThread]
    static int Main(string[] args)
    {
        if (AttachConsole(ATTACH_PARENT_PROCESS))
        {
            var standardOutput = new StreamWriter(Console.OpenStandardOutput()) { AutoFlush = true };
            Console.SetOut(standardOutput);
            var standardError = new StreamWriter(Console.OpenStandardError()) { AutoFlush = true };
            Console.SetError(standardError);
        }

        // Support CLI flags for automation and headless verification
        foreach (var arg in args)
        {
            if (arg == "--version" || arg == "-v")
            {
                Console.WriteLine("PresentationOS Desktop 0.1.2-alpha");
                return 0;
            }
            if (arg == "--test-boot")
            {
                return RunBootVerification();
            }
        }

        ApplicationConfiguration.Initialize();
        Application.SetUnhandledExceptionMode(UnhandledExceptionMode.CatchException);

        var form = new MainForm();
        Application.Run(form);

        CleanupSidecar();
        return 0;
    }

    private static int RunBootVerification()
    {
        Console.WriteLine("[PresentationOS Host] Running self-test boot verification...");
        EnsureSidecarRunning();
        var healthy = WaitForSidecarReady(10).GetAwaiter().GetResult();
        CleanupSidecar();
        if (healthy)
        {
            Console.WriteLine("[PresentationOS Host] Boot verification PASSED.");
            return 0;
        }
        Console.Error.WriteLine("[PresentationOS Host] Boot verification FAILED: Sidecar not responding.");
        return 1;
    }

    public static void EnsureSidecarRunning()
    {
        if (IsSidecarHealthy().GetAwaiter().GetResult())
        {
            Console.WriteLine("[PresentationOS Host] Existing sidecar detected on port " + SidecarPort);
            return;
        }

        var baseDir = AppDomain.CurrentDomain.BaseDirectory;
        var candidates = new[]
        {
            Path.Combine(baseDir, "dist-server", "sidecar-server.js"),
            Path.Combine(baseDir, "..", "..", "..", "..", "desktop", "dist-server", "sidecar-server.js"),
            Path.Combine(baseDir, "..", "desktop", "dist-server", "sidecar-server.js"),
            Path.GetFullPath(@"D:\PresentationOS\apps\desktop\dist-server\sidecar-server.js"),
        };

        string? scriptPath = null;
        foreach (var c in candidates)
        {
            if (File.Exists(c))
            {
                scriptPath = Path.GetFullPath(c);
                break;
            }
        }

        if (scriptPath == null)
        {
            Console.Error.WriteLine("[PresentationOS Host] Warning: Could not locate sidecar-server.js");
            return;
        }

        var psi = new ProcessStartInfo
        {
            FileName = "node.exe",
            Arguments = $"\"{scriptPath}\"",
            UseShellExecute = false,
            CreateNoWindow = true,
            WorkingDirectory = Path.GetDirectoryName(scriptPath)!,
        };
        psi.EnvironmentVariables["PRES_PORT"] = SidecarPort.ToString();

        try
        {
            _sidecarProcess = Process.Start(psi);
            Console.WriteLine($"[PresentationOS Host] Spawned sidecar process (PID: {_sidecarProcess?.Id})");
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[PresentationOS Host] Failed to spawn sidecar: {ex.Message}");
        }
    }

    public static async Task<bool> IsSidecarHealthy()
    {
        using var client = new HttpClient { Timeout = TimeSpan.FromSeconds(1) };
        try
        {
            var res = await client.GetAsync($"http://127.0.0.1:{SidecarPort}/api/health");
            return res.IsSuccessStatusCode;
        }
        catch
        {
            return false;
        }
    }

    public static async Task<bool> WaitForSidecarReady(int maxSeconds)
    {
        for (int i = 0; i < maxSeconds * 10; i++)
        {
            if (await IsSidecarHealthy()) return true;
            await Task.Delay(100);
        }
        return false;
    }

    public static void CleanupSidecar()
    {
        if (_sidecarProcess != null && !_sidecarProcess.HasExited)
        {
            try
            {
                _sidecarProcess.Kill(true);
                _sidecarProcess.Dispose();
            }
            catch { }
            _sidecarProcess = null;
        }
    }
}

public class MainForm : Form
{
    private readonly WebView2 _webView;

    public MainForm()
    {
        Text = "PresentationOS Desktop Workbench";
        Width = 1366;
        Height = 840;
        MinimumSize = new Size(1024, 700);
        StartPosition = FormStartPosition.CenterScreen;
        BackColor = ColorTranslator.FromHtml("#0b0f19");

        // Set UI Automation attributes
        AccessibleName = "PresentationOSMainWindow";
        AccessibleRole = AccessibleRole.Window;

        _webView = new WebView2
        {
            Dock = DockStyle.Fill,
            AccessibleName = "PresentationOSWebView",
            AccessibleRole = AccessibleRole.Client,
        };

        Controls.Add(_webView);

        Program.EnsureSidecarRunning();
        InitWebView();
    }

    private async void InitWebView()
    {
        try
        {
            var userDataFolder = @"D:\PresentationOSData\webview2-cache";
            Directory.CreateDirectory(userDataFolder);
            var env = await CoreWebView2Environment.CreateAsync(null, userDataFolder);
            await _webView.EnsureCoreWebView2Async(env);

            await Program.WaitForSidecarReady(5);
            _webView.Source = new Uri("http://127.0.0.1:48200/");
        }
        catch (Exception ex)
        {
            MessageBox.Show($"Failed to initialize WebView2: {ex.Message}", "PresentationOS Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    protected override void OnFormClosing(FormClosingEventArgs e)
    {
        base.OnFormClosing(e);
        Program.CleanupSidecar();
    }
}
