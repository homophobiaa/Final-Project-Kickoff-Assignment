namespace Safelight.Server.Services;

public static class AppPaths
{
    public static string Home { get; } = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Safelight");

    public static string SampleRoll { get; } = Path.Combine(Home, "Sample Roll");

    public static string DefaultOutput { get; } = Path.Combine(Home, "Developed");
}
