const fs = require('fs');
const path = require('path');

const articlesDir = path.join(__dirname, '../src/knowledge/articles');
const outputFile = path.join(__dirname, '../src/knowledge/data_articles.ts');

function parseMarkdown(content) {
    const frontmatterRegex = /^---\s*([\s\S]*?)\s*---/;
    const match = content.match(frontmatterRegex);

    let title = 'Untitled';
    let summary = '';
    let body = content;

    if (match) {
        const frontmatter = match[1];
        body = content.replace(frontmatterRegex, '').trim();

        const titleMatch = frontmatter.match(/title:\s*"(.*)"/);
        if (titleMatch) title = titleMatch[1];

        const summaryMatch = frontmatter.match(/summary:\s*"(.*)"/);
        if (summaryMatch) summary = summaryMatch[1];
    } else {
        // Fallback title from first line if no frontmatter
        const firstLine = content.split('\n')[0].replace(/^#+\s*/, '');
        if (firstLine) title = firstLine;
    }

    return { title, summary, content: body };
}

function generate() {
    if (!fs.existsSync(articlesDir)) {
        console.error(`Directory not found: ${articlesDir}`);
        process.exit(1);
    }

    const files = fs.readdirSync(articlesDir).filter(file => file.endsWith('.md'));
    const articles = files.map(file => {
        const filePath = path.join(articlesDir, file);
        const fileContent = fs.readFileSync(filePath, 'utf-8');
        const parsed = parseMarkdown(fileContent);
        console.log(`Processed: ${file} -> ${parsed.title}`);
        return parsed;
    });

    const tsContent = `import { Article } from "../knowledge";

export const ARTICLE_DATA: Article[] = ${JSON.stringify(articles.map(a => ({
        title: a.title,
        content: a.content.substring(0, 10000), // Safety limit, though Gemini can handle more
        keywords: [], // Extracted from tags if needed, but omitted for now
    })), null, 4)};
`;

    fs.writeFileSync(outputFile, tsContent);
    console.log(`Generated ${outputFile} with ${articles.length} articles.`);
}

generate();
