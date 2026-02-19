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
                // console.log(`[Spark Debug] ${type} element not found`); // Reduced noise
                return 0;
            }
            const ariaLabel = element.getAttribute('aria-label') || "";
            const text = element.innerText || "";

            // console.log(`[Spark Debug] Parsing ${type} | Text: "${text}" | Label: "${ariaLabel}"`);

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

            // console.log(`[Spark Debug] ${type} Result: ${result}`);
            return result;
        };

        const metrics = {
            likeCount: parseCount(likeElement, 'Like'),
            repostCount: parseCount(repostElement, 'Repost'),
            replyCount: parseCount(replyElement, 'Reply')
        };

        // Final debug log
        // console.log("Scraped Metrics Final:", metrics);

        const tweetCreatedAt = timeElement ? timeElement.getAttribute('datetime') : new Date().toISOString();

        // Send to API
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
    // Avoid duplicates
    if (document.querySelector('.spark-scan-btn')) return;

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

    // Force score to 0 if older than 120 minutes (2 hours)
    if (minutesElapsed > 120) {
        console.log(`[Spark] Skipping old tweet (${minutesElapsed} mins ago)`);
        return 0;
    }

    // Unlimited score
    return Math.floor(numerator / denominator);
}

// --- Main Scan Function ---
async function scanTimeline() {
    const btn = document.querySelector('.spark-scan-btn');
    if (btn) {
        btn.textContent = 'Scanning... (Do not scroll manual)';
        btn.disabled = true;
    }

    const TARGET_COUNT = 50; // Target number of unique tweets to scan
    const MAX_SCROLL_ATTEMPTS = 100; // Safety break (allow more retries to reach 50)
    const SCROLL_DELAY = 1500; // Time to wait after scrolling for content to load

    const uniqueMap = new Map(); // Store detailed candidates by URL to deduplicate
    let scrollAttempts = 0;

    // Helper to extract data from an article
    const extractData = (article) => {
        // --- Lightweight Scrape ---
        const timeElement = article.querySelector('time');
        if (!timeElement) return null;

        const tweetCreatedAt = timeElement.getAttribute('datetime');
        const originalTweetUrl = timeElement.closest('a').href;

        // Ad check
        if (isAd(article)) return null;

        // Metrics
        const actionBar = article.querySelector('[role="group"]');
        let likeElement = article.querySelector('[data-testid="like"]') || article.querySelector('[data-testid="unlike"]');
        let repostElement = article.querySelector('[data-testid="retweet"]') || article.querySelector('[data-testid="unretweet"]');
        let replyElement = article.querySelector('[data-testid="reply"]');

        // New: Views Element (Usually aria-label="N Views")
        // It's often inside a link with href ending in /analytics, or just text with "Views"
        // Strategy: Look for specific aria-label pattern or data-testid="app-text-transition-container" descendant
        // Simple approach: Look for aria-label containing "View" or "Tieng View" (multilingual support hard, assume English/Japanese for now)
        // Actually, X UI structure is complex. Let's look for known structure or try to find by aria-label regex.
        // Better: look for the analytics link `[href$="/analytics"]`
        const analyticsLink = article.querySelector('a[href$="/analytics"]');
        let viewsElement = analyticsLink ? analyticsLink : null;

        // If not found, sometimes it's just a div group. Let's try to find by Icon path if needed, but analytics link is most reliable for stats.

        if (actionBar && (!likeElement || !repostElement)) {
            const buttons = actionBar.querySelectorAll('[role="button"]');
            if (buttons.length >= 3) {
                if (!replyElement) replyElement = buttons[0];
                if (!repostElement) repostElement = buttons[1];
                if (!likeElement) likeElement = buttons[2];
                // Views often 4th item if present
                if (!viewsElement && buttons.length >= 4) {
                    viewsElement = buttons[3];
                }
            }
        }

        // Parse metrics (Using simple logic for brevity, reusing parseCount from above ideally)
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
            replyCount: parseCount(replyElement),
            viewCount: parseCount(viewsElement) // New field
        };

        // Filter: Reply Count > 20 -> Skip (Red Ocean)
        if (metrics.replyCount >= 20) {
            // console.log(`[Spark] Skipping active discussion (Replies: ${metrics.replyCount})`);
            return null;
        }

        // Quoted Tweet Extraction
        // Look for div[role="link"] or similar structure that represents quoted tweet
        // Usually it has specific class or just distinct text container. 
        // We can look for `div[data-testid="tweetText"]` - if there are 2, the second one is usually the quoted one?
        // Or if the main tweet is a quote, the *first* tweetText might be the user's text, and *second* is quoted.
        // Let's grab all text elements.
        const textElements = article.querySelectorAll('[data-testid="tweetText"]');
        let quotedText = "";

        if (textElements.length >= 2) {
            // 2nd one is likely the quoted text
            quotedText = textElements[1].innerText;
        }

        // Updated Score Calculation
        // Score = (Like + Repost * 2 + Reply * 3 + (Views / 100)) / (MinutesElapsed + 10)
        // Re-implement calculation inline to use new metrics
        const now = new Date();
        const postedAt = new Date(tweetCreatedAt);
        const diffMs = now.getTime() - postedAt.getTime();
        const minutesElapsed = Math.max(0, Math.floor(diffMs / 60000));

        if (minutesElapsed > 120) return null; // Keep 2h limit

        const numerator = (metrics.likeCount + 3 * metrics.repostCount + 5 * metrics.replyCount + (metrics.viewCount / 100)) * 10;
        const denominator = minutesElapsed + 10; // Changed from 15 to 10 to boost recent posts slightly more

        const score = Math.floor(numerator / denominator);

        return {
            article,
            score,
            metrics,
            tweetCreatedAt,
            originalTweetUrl,
            quotedText // Store for API
        };
    };

    // Auto-Scroll Loop
    window.scrollTo(0, 0); // Start from top
    await new Promise(r => setTimeout(r, 1000));

    while (uniqueMap.size < TARGET_COUNT && scrollAttempts < MAX_SCROLL_ATTEMPTS) {
        // Collect current visible articles
        const articles = document.querySelectorAll('article');
        for (const article of articles) {
            const data = extractData(article);
            if (data && !uniqueMap.has(data.originalTweetUrl)) {
                uniqueMap.set(data.originalTweetUrl, data);
            }
        }

        // Update Button Feedback
        if (btn) btn.textContent = `Scanning... (${uniqueMap.size}/${TARGET_COUNT})`;

        // Scroll down
        window.scrollBy(0, window.innerHeight * 0.8);
        await new Promise(r => setTimeout(r, SCROLL_DELAY));
        scrollAttempts++;
    }

    const candidates = Array.from(uniqueMap.values());
    console.log(`[Spark] Scanned ${candidates.length} unique candidates.`);

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

        const article = item.article;

        // Scrape details
        const authorElement = article.querySelector('[data-testid="User-Name"]');
        const textElement = article.querySelector('[data-testid="tweetText"]');
        const timeElement = article.querySelector('time');

        const authorName = authorElement ? authorElement.innerText.split('\n')[0] : 'Unknown';
        const originalText = textElement ? textElement.innerText : '';
        const originalTweetUrl = item.originalTweetUrl; // Use URL from map as safe fallback

        // Visual Feedback (might fail if element unmounted, try-catch safe)
        try {
            if (document.body.contains(article)) {
                article.style.border = "3px solid #1d9bf0"; // Highlight selected
            }
        } catch (e) { }

        // Send to API
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
                    quotedText: item.quotedText,
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
