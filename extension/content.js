function createReplyButton() {
    const btn = document.createElement('button');
    btn.textContent = '⚡ Spark';
    btn.className = 'spark-reply-btn';
    btn.style.cssText = `
        background-color: #1d9bf0;
        color: white;
        border: none;
        border-radius: 9999px;
        padding: 6px 12px;
        font-weight: bold;
        font-size: 13px;
        cursor: pointer;
        margin-left: 10px;
        z-index: 9999;
    `;
    return btn;
}

function processTweets() {
    const articles = document.querySelectorAll('article');

    articles.forEach(article => {
        if (article.dataset.sparkProcessed) return;

        // Find the action bar (reply, retweet, like buttons)
        const actionBar = article.querySelector('[role="group"]');
        if (actionBar) {
            const btn = createReplyButton();
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation(); // Prevent opening the tweet
                handleSparkClick(article, btn);
            });

            actionBar.appendChild(btn);
            article.dataset.sparkProcessed = 'true';
        }
    });
}

async function handleSparkClick(article, btn) {
    btn.textContent = '⏳...';
    btn.disabled = true;

    try {
        // Scrape data
        const authorElement = article.querySelector('[data-testid="User-Name"]');
        const textElement = article.querySelector('[data-testid="tweetText"]');
        const timeElement = article.querySelector('time');

        const authorName = authorElement ? authorElement.innerText.split('\n')[0] : 'Unknown';
        const originalText = textElement ? textElement.innerText : '';
        const originalTweetUrl = timeElement ? timeElement.closest('a').href : window.location.href;

        // Simple scraping for metrics (this is fragile and depends on X's DOM)
        // For now, we set defaults or try to parse aria-labels if possible
        // Scrape metrics from action bar
        // Scrape metrics from action bar
        const actionBar = article.querySelector('[role="group"]');

        let likeElement = article.querySelector('[data-testid="like"]') || article.querySelector('[data-testid="unlike"]');
        let repostElement = article.querySelector('[data-testid="retweet"]') || article.querySelector('[data-testid="unretweet"]');
        let replyElement = article.querySelector('[data-testid="reply"]');

        // Fallback: If elements not found by ID, try positional (Action Bar: Reply(0), Repost(1), Like(2), Stats(3))
        if (actionBar && (!likeElement || !repostElement)) {
            const buttons = actionBar.querySelectorAll('[role="button"]');
            if (buttons.length >= 3) {
                if (!replyElement) replyElement = buttons[0];
                if (!repostElement) repostElement = buttons[1];
                if (!likeElement) likeElement = buttons[2];
            }
        }

        const parseCount = (element, type) => {
            if (!element) {
                console.log(`[Spark Debug] ${type} element not found`);
                return 0;
            }
            const ariaLabel = element.getAttribute('aria-label') || "";
            const text = element.innerText || "";

            console.log(`[Spark Debug] Parsing ${type} | Text: "${text}" | Label: "${ariaLabel}"`);

            // Try modifying text first (e.g. "1.5K", "1.5万")
            // If text is empty, try to parse from aria-label (e.g. "155 likes", "1.5万件のいいね")
            let rawValue = text.trim();
            if (!rawValue && ariaLabel) {
                // Determine if aria-label contains digits
                const match = ariaLabel.match(/(\d+(?:,\d+)*(?:\.\d+)?(?:K|M|万|億)?)/);
                if (match) rawValue = match[1];
            }

            if (!rawValue) return 0;

            let multiplier = 1;
            if (rawValue.toUpperCase().includes('K')) multiplier = 1000;
            if (rawValue.toUpperCase().includes('M')) multiplier = 1000000;
            if (rawValue.includes('万')) multiplier = 10000;
            if (rawValue.includes('億')) multiplier = 100000000;

            const num = parseFloat(rawValue.replace(/,/g, '').replace(/[KM万億]/gi, ''));
            const result = isNaN(num) ? 0 : Math.floor(num * multiplier);

            console.log(`[Spark Debug] ${type} Result: ${result}`);
            return result;
        };

        const metrics = {
            likeCount: parseCount(likeElement, 'Like'),
            repostCount: parseCount(repostElement, 'Repost'),
            replyCount: parseCount(replyElement, 'Reply')
        };

        // Final debug log
        console.log("Scraped Metrics Final:", metrics);
        // console.log("Found Elements:", ... ); // Removed verbose object log in favor of per-line debug above

        const tweetCreatedAt = timeElement ? timeElement.getAttribute('datetime') : new Date().toISOString();

        // Send to API
        // NOTE: Allow user to configure this URL in popup later. Default to localhost for dev.
        // const API_URL = 'http://localhost:3000/api/replies';
        const API_URL = 'https://x-semi-auto-support--x-semi-auto-support.asia-east1.hosted.app/api/replies';

        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                originalTweetUrl,
                originalText,
                authorName,
                tweetCreatedAt,
                ...metrics
            })
        });

        if (response.ok) {
            btn.textContent = '✅ Sent';
            btn.style.backgroundColor = '#17bf63';
        } else {
            console.error('API Error:', await response.text());
            btn.textContent = '❌ Error';
            btn.style.backgroundColor = '#e0245e';
        }
    } catch (error) {
        console.error('Network Error:', error);
        btn.textContent = '❌ Fail';
        btn.style.backgroundColor = '#e0245e';
    }

    setTimeout(() => {
        btn.textContent = '⚡ Spark';
        btn.disabled = false;
        btn.style.backgroundColor = '#1d9bf0';
    }, 3000);
}

// --- New Feature: Timeline Batch Scan ---

function createScanButton() {
    const btn = document.createElement('button');
    btn.textContent = '⚡ Scan Top 3';
    btn.className = 'spark-scan-btn';
    btn.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        background-color: #000;
        color: #fff;
        border: 2px solid #333;
        border-radius: 50px;
        padding: 12px 24px;
        font-weight: bold;
        font-size: 16px;
        cursor: pointer;
        z-index: 10000;
        box-shadow: 0 4px 12px rgba(0,0,0,0.5);
        transition: transform 0.2s;
    `;
    btn.onmouseover = () => btn.style.transform = 'scale(1.05)';
    btn.onmouseout = () => btn.style.transform = 'scale(1)';

    btn.onclick = scanTimeline;
    document.body.appendChild(btn);
}

// Check if tweet is an ad
function isAd(article) {
    // Look for "Ad", "Promoted", "プロモーション", "広告" text
    const textContent = article.innerText;
    if (textContent.includes('プロモーション') || textContent.includes('Ad') || textContent.includes('Promoted') || textContent.includes('広告')) {
        return true;
    }
    // Check for specific ad indicators (svg path for ad icon)
    const svgs = article.querySelectorAll('svg');
    for (let svg of svgs) {
        if (svg.getAttribute('aria-label') === 'Promoted' || svg.getAttribute('aria-label') === 'プロモーション' || svg.getAttribute('aria-label') === '広告') {
            return true;
        }
    }
    return false;
}

// Calculate Score locally for sorting
function calculateScore(metrics, tweetCreatedAt) {
    const now = new Date();
    const postedAt = new Date(tweetCreatedAt);
    const diffMs = now.getTime() - postedAt.getTime();
    const minutesElapsed = Math.max(0, Math.floor(diffMs / 60000));

    const { likeCount, repostCount, replyCount } = metrics;

    const numerator = (likeCount + 3 * repostCount + 5 * replyCount) * 10;
    const denominator = minutesElapsed + 15;

    // Unlimited score
    return Math.floor(numerator / denominator);
}

async function scanTimeline() {
    const btn = document.querySelector('.spark-scan-btn');
    if (btn) {
        btn.textContent = 'Scanning...';
        btn.disabled = true;
    }

    const articles = Array.from(document.querySelectorAll('article'));
    console.log(`[Spark] Found ${articles.length} articles.`);

    if (btn) {
        btn.textContent = `Found ${articles.length} Tweets`;
        // Add 3 seconds delay between requests to prevent race conditions/rate limits and reduce server load
        await new Promise(resolve => setTimeout(resolve, 3000));
    }

    const candidates = [];

    for (const article of articles) {
        if (isAd(article)) {
            console.log('[Spark] Skipping Ad');
            continue;
        }

        // Scrape data (reuse handleSparkClick logic parts, extracted ideally)
        // For simplicity, we duplicate the scraping logic here or refactor.
        // Let's perform a lightweight scrape for scoring first.

        // --- Lightweight Scrape ---
        const timeElement = article.querySelector('time');
        if (!timeElement) continue;

        const tweetCreatedAt = timeElement.getAttribute('datetime');

        // Scraping Metrics (Same logic as handleSparkClick)
        const actionBar = article.querySelector('[role="group"]');
        let likeElement = article.querySelector('[data-testid="like"]') || article.querySelector('[data-testid="unlike"]');
        let repostElement = article.querySelector('[data-testid="retweet"]') || article.querySelector('[data-testid="unretweet"]');
        let replyElement = article.querySelector('[data-testid="reply"]');

        if (actionBar && (!likeElement || !repostElement)) {
            const buttons = actionBar.querySelectorAll('[role="button"]');
            if (buttons.length >= 3) {
                if (!replyElement) replyElement = buttons[0];
                if (!repostElement) repostElement = buttons[1];
                if (!likeElement) likeElement = buttons[2];
            }
        }

        const parseCount = (element) => {
            if (!element) return 0;
            const ariaLabel = element.getAttribute('aria-label') || "";
            const text = element.innerText || "";
            let rawValue = text.trim();
            if (!rawValue && ariaLabel) {
                const match = ariaLabel.match(/(\d+(?:,\d+)*(?:\.\d+)?(?:K|M|万|億)?)/);
                if (match) rawValue = match[1];
            }
            if (!rawValue) return 0;
            let multiplier = 1;
            if (rawValue.toUpperCase().includes('K')) multiplier = 1000;
            if (rawValue.toUpperCase().includes('M')) multiplier = 1000000;
            if (rawValue.includes('万')) multiplier = 10000;
            if (rawValue.includes('億')) multiplier = 100000000;
            const num = parseFloat(rawValue.replace(/,/g, '').replace(/[KM万億]/gi, ''));
            return isNaN(num) ? 0 : Math.floor(num * multiplier);
        };

        const metrics = {
            likeCount: parseCount(likeElement),
            repostCount: parseCount(repostElement),
            replyCount: parseCount(replyElement)
        };

        const score = calculateScore(metrics, tweetCreatedAt);

        candidates.push({
            article,
            score,
            metrics,
            tweetCreatedAt
        });
    }

    // Sort by Score Descending
    candidates.sort((a, b) => b.score - a.score);

    // Pick Top 3
    const top3 = candidates.slice(0, 3);
    console.log('[Spark] Top 3 Candidates:', top3);

    // Process Top 3
    let processedCount = 0;
    for (let i = 0; i < top3.length; i++) {
        const item = top3[i];

        // Update Button Progress
        if (btn) {
            btn.textContent = `Sending ${i + 1}/${top3.length}...`;
        }

        // Find the 'Spark' button inside this article to simulate click, OR call logic directly.
        // Calling payload logic directly is cleaner.
        const article = item.article;

        // Full Scrape
        const authorElement = article.querySelector('[data-testid="User-Name"]');
        const textElement = article.querySelector('[data-testid="tweetText"]');
        const timeElement = article.querySelector('time');

        const authorName = authorElement ? authorElement.innerText.split('\n')[0] : 'Unknown';
        const originalText = textElement ? textElement.innerText : '';
        const originalTweetUrl = timeElement ? timeElement.closest('a').href : window.location.href;

        // Visual Feedback
        article.style.border = "3px solid #1d9bf0"; // Highlight selected

        // Send to API
        // const API_URL = 'http://localhost:3000/api/replies';
        const API_URL = 'https://x-semi-auto-support--x-semi-auto-support.asia-east1.hosted.app/api/replies';
        try {
            await fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    originalTweetUrl,
                    originalText,
                    authorName,
                    tweetCreatedAt: item.tweetCreatedAt,
                    ...item.metrics
                })
            });
            processedCount++;
        } catch (e) {
            console.error("Failed to send batch item", e);
        }

        // Add 3 seconds delay
        await new Promise(resolve => setTimeout(resolve, 3000));
    }

    if (btn) {
        btn.textContent = `✅ Sent ${processedCount}`;
        setTimeout(() => {
            btn.textContent = '⚡ Scan Top 3';
            btn.disabled = false;
        }, 3000);
    }
}


// Run periodically to handle infinite scroll (existing logic)
setInterval(processTweets, 1000);

// Initialize Scan Button
createScanButton();
