using Safelight.Core.Imaging;

namespace Safelight.Core.Tests;

public class SizeCalculatorTests
{
    [Fact]
    public void Proportional_fit_matches_the_assignment_example()
    {
        var size = SizeCalculator.Fit(3265, 4898, new ResizeOptions { Width = 800, Height = 600 });

        Assert.Equal((400, 600), size);
    }

    [Theory]
    [InlineData(6000, 4000, 800, 600, 800, 533)]
    [InlineData(4000, 6000, 800, 600, 400, 600)]
    [InlineData(3000, 3000, 1024, 768, 768, 768)]
    public void Proportional_fit_keeps_the_aspect_ratio(int sw, int sh, int tw, int th, int ew, int eh)
    {
        var size = SizeCalculator.Fit(sw, sh, new ResizeOptions { Width = tw, Height = th });

        Assert.Equal((ew, eh), size);
    }

    [Fact]
    public void Small_images_are_not_upscaled_by_default()
    {
        var size = SizeCalculator.Fit(640, 480, new ResizeOptions { Width = 1920, Height = 1200 });

        Assert.Equal((640, 480), size);
    }

    [Fact]
    public void Small_images_are_upscaled_when_allowed()
    {
        var size = SizeCalculator.Fit(640, 480, new ResizeOptions { Width = 1920, Height = 1200, AllowUpscale = true });

        Assert.Equal((1600, 1200), size);
    }

    [Fact]
    public void Without_aspect_ratio_the_target_is_used_exactly()
    {
        var size = SizeCalculator.Fit(3265, 4898, new ResizeOptions { Width = 800, Height = 600, KeepAspectRatio = false });

        Assert.Equal((800, 600), size);
    }
}
