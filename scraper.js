const fs = require('fs');
const puppeteer = require('puppeteer');

const CONCURRENCY = 6; // مثالي لـ 8GB RAM (خاصة على Codespaces)
const START = 11030000;
const END = 11070000;

async function processNumber(browser, num) {
    const page = await browser.newPage();
    try {
        // ✅ إصلاح الرابط: إزالة المسافات الزائدة
        await page.goto('https://daleel.admission.gov.sd/result2024/Result_2024.aspx', {
            waitUntil: 'domcontentloaded',
            timeout: 10000
        });

        await page.evaluate((num) => {
            const input = document.querySelector('#TextBox1');
            if (input) input.value = num;
        }, num.toString());

        const response = await Promise.race([
            page.click('#Button1').then(() => page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 12000 })),
            new Promise(resolve => setTimeout(resolve, 13000))
        ]);

        if (!response) {
            await page.close();
            return { number: num, name: "خطأ: انتهاء المهلة", college: "خطأ" };
        }

        // ✅ التحقق الآمن: هل هناك جدول نتائج؟
        const hasResultTable = await page.$('table[summary="Result"]') || await page.$('#GridView1') || await page.$('table');

        if (!hasResultTable) {
            await page.close();
            return { number: num, name: "لا توجد", college: "لا توجد" };
        }

        // ✅ محاولة استخراج من الصف الثاني من أول جدول
        const firstRowTexts = await page.$$eval('table tr:nth-child(2) td', tds => 
            tds.map(td => td.textContent.trim())
        );

        if (firstRowTexts.length >= 2) {
            const name = firstRowTexts[0];
            const college = firstRowTexts[1];
            if (name && name !== '' && !name.includes('لا توجد') && !name.includes('غير موجود')) {
                await page.close();
                return { number: num, name, college };
            }
        }

        await page.close();
        return { number: num, name: "لا توجد", college: "لا توجد" };

    } catch (err) {
        await page.close();
        return { number: num, name: `خطأ: ${err.message}`, college: "خطأ" };
    }
}

(async () => {
    console.log(`🚀 بدء المعالجة من ${START} إلى ${END} (العدد: ${END - START + 1})`);

    const browser = await puppeteer.launch({
        headless: true,
        executablePath: '/usr/bin/chromium-browser',
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--disable-features=site-per-process'
        ]
    });

    const total = END - START + 1;
    let completed = 0;

    const saveResult = (result) => {
        fs.appendFileSync('results_fast.jsonl', JSON.stringify(result) + '\n', 'utf-8');
        completed++;
        if (completed % 100 === 0) {
            console.log(`✅ ${completed} / ${total} | الوقت: ${new Date().toLocaleTimeString()}`);
        }
    };

    const numbers = Array.from({ length: total }, (_, i) => START + i);

    for (let i = 0; i < numbers.length; i += CONCURRENCY) {
        const batch = numbers.slice(i, i + CONCURRENCY);
        const promises = batch.map(num => processNumber(browser, num).then(saveResult));
        await Promise.all(promises);
    }

    // دمج الملف النهائي
    const lines = fs.readFileSync('results_fast.jsonl', 'utf-8')
        .split('\n')
        .filter(line => line.trim());
    const results = lines.map(line => JSON.parse(line));

    fs.writeFileSync('results_fast_final.json', JSON.stringify(results, null, 2), 'utf-8');
    await browser.close();

    console.log(`🎉 الانتهاء! تم حفظ ${results.length} نتيجة في results_fast_final.json`);
})();
