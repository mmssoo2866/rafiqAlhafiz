import { Router, type IRouter } from "express";

const router: IRouter = Router();

/**
 * بروكسي لصور المصحف — يجلب الصورة من android.quran.com من جانب الخادم
 * ويعيدها للمتصفح مع headers صحيحة لتجنب مشاكل CORS والـ hotlink protection.
 *
 * GET /api/quran-image/:page  (page: 1-604)
 */
router.get("/quran-image/:page", async (req, res) => {
  const page = parseInt(req.params.page ?? "0", 10);

  if (!page || page < 1 || page > 604) {
    res.status(400).json({ error: "رقم الصفحة يجب أن يكون بين 1 و 604" });
    return;
  }

  const padded = String(page).padStart(3, "0");
  const upstreamUrl = `https://android.quran.com/data/single_page/images_1920/page${padded}.png`;

  try {
    const upstream = await fetch(upstreamUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; QuranProxy/1.0)",
      },
    });

    if (!upstream.ok) {
      res.status(502).json({ error: `upstream ${upstream.status}` });
      return;
    }

    const contentType = upstream.headers.get("content-type") ?? "image/png";
    const buffer = await upstream.arrayBuffer();

    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.send(Buffer.from(buffer));
  } catch (err) {
    res.status(502).json({ error: "فشل الاتصال بمصدر الصور" });
  }
});

export default router;
