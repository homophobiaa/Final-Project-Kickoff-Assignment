using System.Text.Json.Serialization;
using Safelight.Core.Engine;
using Safelight.Server.Endpoints;
using Safelight.Server.Hubs;
using Safelight.Server.Services;

var builder = WebApplication.CreateBuilder(args);

builder.Services.ConfigureHttpJsonOptions(options => options.SerializerOptions.Converters.Add(new JsonStringEnumConverter()));
builder.Services
    .AddSignalR()
    .AddJsonProtocol(options => options.PayloadSerializerOptions.Converters.Add(new JsonStringEnumConverter()));

builder.Services.AddMemoryCache(options => options.SizeLimit = 256L * 1024 * 1024);
builder.Services.AddSingleton<ResizeEngine>();
builder.Services.AddSingleton<ThumbnailService>();
builder.Services.AddHostedService<SnapshotBroadcaster>();

var app = builder.Build();

app.UseDefaultFiles();
app.UseStaticFiles();

app.MapHub<EngineHub>("/hub/engine");
app.MapApi();
app.MapFallbackToFile("index.html");

app.Run();
