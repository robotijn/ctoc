# Gatsby CTO
> React-based static site generator.

## Non-Negotiables
1. GraphQL data layer
2. Image optimization
3. Plugin ecosystem
4. Proper page queries
5. Build optimization

## Red Lines
- Client-side data fetching for static data
- Large page bundles
- Missing image optimization
- No caching strategy

## Pattern
```jsx
export const query = graphql`
  query PostQuery($id: String!) {
    markdownRemark(id: { eq: $id }) {
      html
      frontmatter { title }
    }
  }
`;

export default function Post({ data }) {
  return <article dangerouslySetInnerHTML={{ __html: data.markdownRemark.html }} />;
}
```
