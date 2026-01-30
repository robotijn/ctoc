# Gatsby CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
npm create gatsby@latest my-site
cd my-site && npm run develop
# Gatsby 5 - requires Node.js 18+
```

## Claude's Common Mistakes
1. **Client-side fetching for static data** — Use GraphQL page queries at build time
2. **Using `<img>` tags** — Use `gatsby-plugin-image` for optimization
3. **Large page bundles** — Split and lazy load components
4. **Missing caching strategy** — Gatsby Cloud or incremental builds
5. **Ignoring Core Web Vitals** — Optimize LCP, CLS, FID

## Correct Patterns (2026)
```jsx
// src/templates/post.jsx
import React from 'react';
import { graphql } from 'gatsby';
import { GatsbyImage, getImage } from 'gatsby-plugin-image';

// Page query (runs at build time, not client)
export const query = graphql`
  query PostQuery($id: String!) {
    markdownRemark(id: { eq: $id }) {
      html
      frontmatter {
        title
        date(formatString: "MMMM DD, YYYY")
        featuredImage {
          childImageSharp {
            gatsbyImageData(width: 800)
          }
        }
      }
    }
  }
`;

export default function PostTemplate({ data }) {
  const { markdownRemark: post } = data;
  const image = getImage(post.frontmatter.featuredImage);

  return (
    <article>
      <h1>{post.frontmatter.title}</h1>
      {/* Use GatsbyImage, NOT <img> */}
      {image && <GatsbyImage image={image} alt={post.frontmatter.title} />}
      <div dangerouslySetInnerHTML={{ __html: post.html }} />
    </article>
  );
}
```

## Version Gotchas
- **Gatsby 5**: Slice API, Script component, partial hydration
- **React 18**: Required; concurrent features
- **gatsby-plugin-image**: Replaces gatsby-image
- **GraphQL**: Build-time queries, not runtime

## What NOT to Do
- ❌ `fetch()` in components for CMS data — Use GraphQL page queries
- ❌ `<img src={...}>` — Use `<GatsbyImage>` for optimization
- ❌ All JS in main bundle — Use `loadable-components` for code splitting
- ❌ `gatsby build` without cache — Use incremental builds
- ❌ Ignoring Lighthouse scores — Optimize Core Web Vitals

## Data Sources
| Source | Plugin |
|--------|--------|
| Markdown | `gatsby-transformer-remark` |
| Contentful | `gatsby-source-contentful` |
| Sanity | `gatsby-source-sanity` |
| WordPress | `gatsby-source-wordpress` |

## Image Optimization
```jsx
// Always use GatsbyImage
import { GatsbyImage, getImage } from 'gatsby-plugin-image';

const image = getImage(data.file);
<GatsbyImage image={image} alt="Description" />
```
