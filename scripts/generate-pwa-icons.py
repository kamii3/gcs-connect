import os
from PIL import Image, ImageDraw

def create_gcs_icon(size):
    # Create image with dark obsidian background
    img = Image.new('RGBA', (size, size), (11, 16, 14, 255))
    draw = ImageDraw.Draw(img)
    
    # Outer rounded square or soft circle container
    margin = int(size * 0.08)
    corner_radius = int(size * 0.22)
    
    # Gradient or solid emerald background pill
    draw.rounded_rectangle(
        [(margin, margin), (size - margin, size - margin)],
        radius=corner_radius,
        fill=(18, 24, 22, 255),
        outline=(0, 168, 121, 255),
        width=max(2, int(size * 0.02))
    )
    
    # Draw Shield Symbol in emerald (#00A879) and pale mint (#B6F1D9)
    cx, cy = size // 2, size // 2
    sw = size * 0.44
    sh = size * 0.52
    
    # Shield polygon
    top = cy - sh * 0.48
    bottom = cy + sh * 0.52
    left = cx - sw * 0.5
    right = cx + sw * 0.5
    mid_y = cy + sh * 0.1
    
    shield_pts = [
        (cx, top),
        (right, top + sh * 0.12),
        (right, mid_y),
        (cx, bottom),
        (left, mid_y),
        (left, top + sh * 0.12),
    ]
    
    draw.polygon(shield_pts, fill=(0, 168, 121, 230), outline=(52, 211, 153, 255))
    
    # Inner checkmark or keyhole in mint (#B6F1D9)
    # Checkmark points
    p1 = (cx - sw * 0.22, cy)
    p2 = (cx - sw * 0.04, cy + sh * 0.18)
    p3 = (cx + sw * 0.26, cy - sh * 0.15)
    
    check_width = max(3, int(size * 0.045))
    draw.line([p1, p2, p3], fill=(255, 255, 255, 255), width=check_width, joint="curve")
    
    return img

os.makedirs('public/images', exist_ok=True)

# Generate 512x512
icon512 = create_gcs_icon(512)
icon512.save('public/images/android-chrome-512x512.png', 'PNG')

# Generate 192x192
icon192 = create_gcs_icon(192)
icon192.save('public/images/android-chrome-192x192.png', 'PNG')

# Generate 180x180 (Apple Touch Icon)
icon180 = create_gcs_icon(180)
icon180.save('public/images/apple-touch-icon.png', 'PNG')

# Favicon ICO
icon32 = create_gcs_icon(32)
icon32.save('public/favicon.ico', 'ICO')

print("PWA icons generated successfully!")
