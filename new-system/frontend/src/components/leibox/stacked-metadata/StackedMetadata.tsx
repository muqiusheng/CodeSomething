export function StackedMetadata({tags}: {tags: string[]}) {
 return <ul className="tech-tag-track" aria-label="项目技术">
  {tags.map(tag => <li key={tag} className="badge tech-tag">{tag}</li>)}
 </ul>;
}
