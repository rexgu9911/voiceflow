from PIL import Image
import sys

img = Image.open(sys.argv[1]).convert("RGBA")
datas = img.getdata()
newData = []

for item in datas:
    lum = 0.299 * item[0] + 0.587 * item[1] + 0.114 * item[2]
    # The background is very dark (lum ~30-50). The logo is bright (lum ~150-255).
    # 70 to 180 is the blend zone for anti-aliasing.
    l_min = 60
    l_max = 180
    if lum <= l_min:
        newData.append((255, 255, 255, 0))
    else:
        alpha = int((lum - l_min) / (l_max - l_min) * 255)
        if alpha > 255: alpha = 255
        newData.append((item[0], item[1], item[2], alpha))

img.putdata(newData)
img.save(sys.argv[2], "PNG")
