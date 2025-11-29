const fs = require('fs');
const puppeteer = require('puppeteer');

// عدد المتصفحات المتزامنة (يمكنك تعديله حسب قوة جهازك واتصال الإنترنت)
const CONCURRENCY = 8;
// نطاق الأرقام
const START = 11030000;
const END = 11070000;

// دالة معالجة رقم واحد
async function processNumber(browser, num) {
    const page = await browser.newPage();
    try {
        // تحميل الصفحة (بدون انتظار كامل — فقط load يكفي للسرعة)
        await page.goto('https://daleel.admission.gov.sd/result2024/Result_2024.aspx', {
            waitUntil: 'load',
            timeout: 8000
        });

        // تعيين القيمة مباشرة عبر evaluate (أسرع من type)
        await page.evaluate((num) => {
            document.querySelector('#TextBox1').value = num;
        }, num.toString());

        // النقر وانتظار النتيجة بأسرع طريقة
        await Promise.all([
            page.click('#Button1'),
            page.waitForNavigation({ waitUntil: 'load', timeout: 8000 })
        ]);

        // استخراج النتيجة
        const rows = await page.$$('#GridView1 tr');
        if (rows.length > 1) {
            const tds = await rows[1].$$('td');
            if (tds.length >= 2) {
                const name = await tds[0].evaluate(el => el.textContent.trim());
                const college = await tds[1].evaluate(el => el.textContent.trim());
                if (name && name !== '' && name !== '&nbsp;' && name !== '\xa0') {
                    await page.close();
                    return { number: num, name, college };
                }
            }
        }
        await page.close();
        return { number: num, name: "لا توجد", college: "لا توجد" };

    } catch (err) {
        await page.close();
        return { number: num, name: "خطأ", college: "خطأ" };
    }
}

(async () => {
    const browser = await puppeteer.launch({
        headless: true,
        executablePath: '/usr/bin/chromium-browser',
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--single-process' // قد يُسرّع على بعض الخوادم
        ]
    });

    const results = [];
    const total = END - START + 1;

    // دالة لحفظ النتائج فور توفرها
    const saveResult = (result) => {
        results.push(result);
        // كتابة مباشرة (بدون انتظار) — غير فعّال للقراءة لكن سريع للكتابة
        fs.appendFileSync('results_fast.jsonl', JSON.stringify(result) + '\n', 'utf-8');
        if (results.length % 50 === 0) {
            console.log(`✅ أنهى: ${results.length} / ${total}`);
        }
    };

    // تشغيل المهام بالتوازي
    const numbers = Array.from({ length: total }, (_, i) => START + i);
    const promises = [];

    for (let i = 0; i < numbers.length; i += CONCURRENCY) {
        const batch = numbers.slice(i, i + CONCURRENCY);
        const batchPromises = batch.map(num => processNumber(browser, num).then(saveResult));
        await Promise.all(batchPromises);
    }

    // تحويل JSONL إلى JSON كامل (اختياري في النهاية)
    const finalResults = fs.readFileSync('results_fast.jsonl', 'utf-8')
        .split('\n')
        .filter(line => line.trim())
        .map(line => JSON.parse(line));

    fs.writeFileSync('results_fast_final.json', JSON.stringify(finalResults, null, 2), 'utf-8');
    await browser.close();
    console.log('🚀 الانتهاء! النتائج في results_fast_final.json');
})();
