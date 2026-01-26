# Gatsby CTO
> React-based static site generator - GraphQL data layer, plugin ecosystem.

## Commands
```bash
# Setup | Dev | Test
npx gatsby new mysite && cd mysite
gatsby develop
npm test
```

## Non-Negotiables
1. GraphQL data layer for all content
2. Image optimization with `gatsby-plugin-image`
3. Plugin ecosystem leveraged properly
4. Page queries for static data
5. Build optimization with caching

## Red Lines
- Client-side data fetching for static data
- Large page bundles - split and lazy load
- Missing image optimization
- No caching strategy for builds
- Ignoring Core Web Vitals

## Pattern: Dynamic Page with Query
```jsx
// src/templates/post.jsx
import React from 'react';
import { graphql } from 'gatsby';
import { GatsbyImage, getImage } from 'gatsby-plugin-image';

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
      <time>{post.frontmatter.date}</time>
      {image && <GatsbyImage image={image} alt={post.frontmatter.title} />}
      <div dangerouslySetInnerHTML={{ __html: post.html }} />
    </article>
  );
}

// gatsby-node.js
exports.createPages = async ({ graphql, actions }) => {
  const { data } = await graphql(`
    query {
      allMarkdownRemark {
        nodes { id, frontmatter { slug } }
      }
    }
  `);

  data.allMarkdownRemark.nodes.forEach(node => {
    actions.createPage({
      path: `/blog/${node.frontmatter.slug}`,
      component: require.resolve('./src/templates/post.jsx'),
      context: { id: node.id },
    });
  });
};
```

## Integrates With
- **CMS**: Contentful, Sanity, Strapi via source plugins
- **Styling**: CSS Modules, styled-components, Tailwind
- **SEO**: `gatsby-plugin-react-helmet`
- **Deploy**: Gatsby Cloud, Netlify, Vercel

## Common Errors
| Error | Fix |
|-------|-----|
| `GraphQL error` | Check query syntax, run `gatsby clean` |
| `Build OOM` | Increase Node memory, optimize images |
| `Page not found` | Check `createPage` in gatsby-node.js |
| `Image not rendering` | Use `GatsbyImage` not `img` tag |

## Prod Ready
- [ ] Image optimization configured
- [ ] Sitemap plugin enabled
- [ ] SEO meta tags on all pages
- [ ] Bundle analyzed and optimized
- [ ] Incremental builds configured
- [ ] Lighthouse score > 90
