// Builds the 100-product fake catalogue (src/data/products.json) and downloads
// product photos into public/images/. Photos come from the free dummyjson.com API.
// Usage: node scripts/build-catalog.mjs
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

// source category, our category, how many, price band (INR), return-rate band (%)
const PLAN = [
  ['womens-dresses', 'Women Fashion', 5, [299, 699], [18, 34]],
  ['tops', 'Women Fashion', 5, [199, 449], [15, 30]],
  ['mens-shirts', 'Men Fashion', 5, [249, 549], [14, 28]],
  ['womens-jewellery', 'Jewellery & Accessories', 3, [99, 349], [5, 14]],
  ['womens-watches', 'Jewellery & Accessories', 5, [299, 799], [6, 15]],
  ['mens-watches', 'Jewellery & Accessories', 6, [299, 799], [6, 15]],
  ['sunglasses', 'Jewellery & Accessories', 5, [149, 349], [8, 18]],
  ['womens-bags', 'Bags & Footwear', 5, [299, 699], [8, 18]],
  ['womens-shoes', 'Bags & Footwear', 5, [349, 799], [16, 30]],
  ['mens-shoes', 'Bags & Footwear', 5, [349, 799], [16, 30]],
  ['beauty', 'Beauty & Health', 5, [99, 399], [3, 10]],
  ['fragrances', 'Beauty & Health', 5, [199, 499], [3, 9]],
  ['skin-care', 'Beauty & Health', 3, [149, 349], [3, 9]],
  ['kitchen-accessories', 'Home & Kitchen', 19, [99, 599], [3, 12]],
  ['home-decoration', 'Home & Kitchen', 5, [149, 499], [5, 14]],
  ['mobile-accessories', 'Electronics', 9, [129, 599], [6, 16]],
  ['sports-accessories', 'Sports & Fitness', 5, [149, 699], [5, 13]],
]

const SUBCAT = {
  'womens-dresses': 'Dresses', tops: 'Tops & Kurtis', 'mens-shirts': 'Shirts',
  'womens-jewellery': 'Jewellery', 'womens-watches': 'Watches', 'mens-watches': 'Watches',
  sunglasses: 'Sunglasses', 'womens-bags': 'Handbags', 'womens-shoes': 'Women Footwear',
  'mens-shoes': 'Men Footwear', beauty: 'Makeup', fragrances: 'Fragrances',
  'skin-care': 'Skin Care', 'kitchen-accessories': 'Kitchen', 'home-decoration': 'Home Decor',
  'mobile-accessories': 'Mobile Accessories', 'sports-accessories': 'Fitness',
}
const WOMEN = ['womens-dresses', 'tops', 'womens-jewellery', 'womens-watches', 'womens-bags', 'womens-shoes', 'beauty']
const MEN = ['mens-shirts', 'mens-watches', 'mens-shoes']
const FESTIVE = ['womens-dresses', 'womens-jewellery', 'fragrances', 'home-decoration', 'womens-watches', 'beauty']
const DAILY = ['kitchen-accessories', 'skin-care', 'mobile-accessories']
const BULK = ['tops', 'womens-jewellery', 'kitchen-accessories', 'beauty']
const GIFT = ['fragrances', 'womens-watches', 'mens-watches', 'home-decoration']
const SELLER_BY_CAT = {
  'Women Fashion': 'S1', 'Jewellery & Accessories': 'S1', 'Men Fashion': 'S2',
  'Bags & Footwear': 'S2', 'Beauty & Health': 'S3', 'Home & Kitchen': 'S4',
  Electronics: 'S5', 'Sports & Fitness': 'S6',
}

// Renames branded / odd source titles into marketplace-style names; optional price fix.
const OVERRIDES = {
  "Black Women's Gown": ['Elegant Black Party Gown'],
  'Corset Leather With Skirt': ['Western Corset Top with Flared Skirt'],
  'Corset With Black Skirt': ['Trendy Corset Co-ord Set'],
  'Dress Pea': ['Pastel A-Line Midi Dress'],
  'Marni Red & Black Suit': ['Red & Black Printed Kurta Suit'],
  'Blue Frock': ['Blue Cotton Anarkali Frock'],
  'Girl Summer Dress': ['Floral Summer Kurti Dress'],
  'Gray Dress': ['Grey Rayon Straight Kurti'],
  'Short Frock': ['Printed Short Kurti'],
  'Tartan Dress': ['Checked Tunic Top'],
  'Blue & Black Check Shirt': ['Blue & Black Check Casual Shirt'],
  'Gigabyte Aorus Men Tshirt': ['Graphic Printed Men T-shirt'],
  'Man Plaid Shirt': ['Plaid Cotton Shirt'],
  'Man Short Sleeve Shirt': ['Half Sleeve Formal Shirt'],
  'Men Check Shirt': ['Slim Fit Check Shirt'],
  'Green Crystal Earring': ['Green Crystal Jhumka Earrings'],
  'Green Oval Earring': ['Oxidised Green Oval Earrings'],
  'Tropical Earring': ['Tropical Tassel Earrings'],
  'IWC Ingenieur Automatic Steel': ['Silver Steel Chain Watch (Men)'],
  'Rolex Cellini Moonphase': ['Moonphase Dial Analog Watch'],
  'Rolex Datejust Women': ['Rose Gold Bracelet Watch (Women)'],
  'Watch Gold for Women': ['Golden Bangle Watch (Women)'],
  "Women's Wrist Watch": ['Minimal Strap Watch (Women)'],
  'Brown Leather Belt Watch': ['Brown Leather Strap Watch'],
  'Longines Master Collection': ['Classic Roman Dial Watch'],
  'Rolex Cellini Date Black Dial': ['Black Dial Formal Watch'],
  'Rolex Datejust': ['Two-tone Date Watch'],
  'Rolex Submariner Watch': ['Sports Diver Style Watch'],
  'Black Sun Glasses': ['UV Protected Black Sunglasses'],
  'Classic Sun Glasses': ['Classic Wayfarer Sunglasses'],
  'Green and Black Glasses': ['Green Tint Aviator Sunglasses'],
  'Party Glasses': ['Funky Party Sunglasses'],
  'Sunglasses': ['Retro Round Sunglasses'],
  "Blue Women's Handbag": ['Blue Sling Handbag'],
  "Heshe Women's Leather Bag": ['Faux Leather Shoulder Bag'],
  'Prada Women Bag': ['Structured Tote Bag'],
  'White Faux Leather Backpack': ['White Faux Leather Backpack'],
  'Women Handbag Black': ['Black Everyday Handbag'],
  'Black & Brown Slipper': ['Comfort Flat Slippers'],
  'Calvin Klein Heel Shoes': ['Block Heel Sandals'],
  'Golden Shoes Woman': ['Golden Party Heels'],
  'Pampi Shoes': ['Casual Bellies'],
  'Red Shoes': ['Red Ethnic Juttis'],
  'Nike Air Jordan 1 Red And Black': ['High-top Red & Black Sneakers'],
  'Nike Baseball Cleats': ['Studded Sports Shoes'],
  'Puma Future Rider Trainers': ['Lightweight Running Shoes'],
  'Sports Sneakers Off White & Red': ['Off-white Chunky Sneakers'],
  'Sports Sneakers Off White Red': ['Off-white Mesh Sneakers'],
  'Essence Mascara Lash Princess': ['Volume Lash Mascara'],
  'Eyeshadow Palette with Mirror': ['12-shade Eyeshadow Palette'],
  'Powder Canister': ['Compact Face Powder'],
  'Red Lipstick': ['Matte Red Lipstick'],
  'Red Nail Polish': ['Gel Finish Nail Polish (Red)'],
  'Calvin Klein CK One': ['Unisex Fresh Perfume 100ml'],
  'Chanel Coco Noir Eau De': ['Noir Floral Perfume 50ml'],
  "Dior J'adore": ['Rose Blossom Perfume 50ml'],
  'Dolce Shine Eau de': ['Citrus Shine Body Mist'],
  'Gucci Bloom Eau de': ['Jasmine Bloom Attar Spray'],
  'Attitude Super Leaves Hand Soap': ['Herbal Neem Hand Wash'],
  'Olay Ultra Moisture Shea Butter Body Wash': ['Shea Butter Body Wash'],
  'Vaseline Men Body and Face Lotion': ['Men Body & Face Lotion'],
  'Black Aluminium Cup': ['Insulated Steel Tea Mug'],
  'Black Whisk': ['Steel Egg Whisk'],
  'Boxed Blender': ['Mixer Grinder 500W', 1299],
  'Carbon Steel Wok': ['Non-stick Kadhai'],
  'Chopping Board': ['Wooden Chopping Board'],
  'Citrus Squeezer Yellow': ['Lemon Squeezer'],
  'Electric Stove': ['Electric Induction Cooktop', 1199],
  'Fork': ['Steel Cutlery Set (6 pcs)'],
  'Glass': ['Glass Tumbler Set (6 pcs)'],
  'Grater Black': ['4-in-1 Vegetable Grater'],
  'Hand Blender': ['Hand Blender 250W', 549],
  'Ice Cube Tray': ['Silicone Ice Cube Tray'],
  'Kitchen Sieve': ['Atta Sieve (Chalni)'],
  'Knife': ['Stainless Steel Kitchen Knife'],
  'Lunch Box': ['3-tier Steel Lunch Box'],
  'Microwave Oven': ['Microwave Oven 20L', 4499],
  'Decoration Swing': ['Decorative Jhula Showpiece'],
  'Family Tree Photo Frame': ['Family Tree Photo Frame'],
  'House Showpiece Plant': ['Artificial Bonsai Showpiece'],
  'Plant Pot': ['Ceramic Plant Pot'],
  'Table Lamp': ['Bedside Table Lamp'],
  'Amazon Echo Plus': ['Smart Bluetooth Speaker', 899],
  'Apple Airpods': ['TWS Wireless Earbuds'],
  'Apple AirPods Max Silver': ['Over-ear Bluetooth Headphones', 899],
  'Apple Airpower Wireless Charger': ['Wireless Charging Pad'],
  'Apple HomePod Mini Cosmic Grey': ['Mini Portable Speaker'],
  'Apple iPhone Charger': ['20W Fast Charger'],
  'Apple MagSafe Battery Pack': ['10000mAh Power Bank'],
  'Apple Watch Series 4 Gold': ['Smart Fitness Watch', 999],
  'Beats Flex Wireless Earphones': ['Neckband Wireless Earphones'],
  'American Football': ['Rugby Practice Ball'],
  'Baseball Ball': ['Hard Practice Ball'],
  'Baseball Glove': ['Leather Fielding Glove'],
  'Basketball': ['Rubber Basketball (Size 7)'],
  'Basketball Rim': ['Wall-mount Basketball Ring'],
}

// deterministic pseudo-random int in [0, n)
const h = (s, n) => parseInt(createHash('md5').update(s).digest('hex').slice(0, 12), 16) % n
const r9 = (x) => Math.round(x / 10) * 10 - 1

const res = await fetch('https://dummyjson.com/products?limit=0&select=title,category,thumbnail,description')
const src = (await res.json()).products
mkdirSync(join(ROOT, 'public/images'), { recursive: true })
mkdirSync(join(ROOT, 'src/data'), { recursive: true })

const out = []
for (const [cat, ourCat, n, [lo, hi], [rlo, rhi]] of PLAN) {
  for (const p of src.filter((x) => x.category === cat).slice(0, n)) {
    const id = `P${String(out.length + 1).padStart(3, '0')}`
    const key = p.title
    let [name, fixedPrice] = OVERRIDES[key] ?? [key]
    if (out.some((x) => x.name === name)) name += ' II'
    const price = fixedPrice ?? r9(lo + h(key + 'p', hi - lo))
    const tags = []
    if (price < 250) tags.push('budget')
    if (FESTIVE.includes(cat)) tags.push('festive')
    if (DAILY.includes(cat)) tags.push('daily-use')
    if (BULK.includes(cat) || (price < 400 && h(key + 'b', 3) === 0)) tags.push('bulk-friendly')
    if (h(key + 't', 4) === 0) tags.push('trending')
    if (GIFT.includes(cat)) tags.push('gift')
    const image = `images/${id}.webp`
    const dest = join(ROOT, 'public', image)
    if (!existsSync(dest)) {
      const img = await fetch(encodeURI(p.thumbnail))
      writeFileSync(dest, Buffer.from(await img.arrayBuffer()))
    }
    out.push({
      id,
      name,
      description: p.description,
      category: ourCat,
      subcategory: SUBCAT[cat],
      gender: WOMEN.includes(cat) ? 'women' : MEN.includes(cat) ? 'men' : 'unisex',
      price,
      mrp: r9(price * (1.6 + h(key + 'm', 90) / 100)),
      rating: Math.round((3.6 + h(key + 'r', 13) / 10) * 10) / 10,
      ratingCount: 120 + h(key + 'c', 9000),
      image,
      tags,
      sellerId: cat.endsWith('watches') ? 'S2' : SELLER_BY_CAT[ourCat],
      returnRate: rlo + h(key + 'rr', rhi - rlo),
      stock: 10 + h(key + 's', 90),
      weeklySales: Array.from({ length: 8 }, (_, w) => 3 + h(key + w, 12) + Math.floor((w * h(key + 'g', 4)) / 2)),
    })
  }
}
writeFileSync(join(ROOT, 'src/data/products.json'), JSON.stringify(out, null, 1))
console.log(out.length, 'products written')
