package dev.codesomething.boot;

import java.io.StringReader;
import java.util.*;
import javax.xml.XMLConstants;
import javax.xml.parsers.DocumentBuilderFactory;
import org.w3c.dom.*;
import org.xml.sax.InputSource;

/** Read metadata without Maven execution, network access or XML entity resolution. */
public record MavenProjectConfig(String dependencyPom) {
    private static final Set<String> PLUGINS=Set.of("maven-compiler-plugin","maven-surefire-plugin","maven-resources-plugin","maven-jar-plugin","maven-clean-plugin","maven-install-plugin","maven-deploy-plugin","maven-site-plugin","maven-javadoc-plugin","maven-source-plugin","maven-failsafe-plugin");
    public static MavenProjectConfig parse(String pom) {
        try {
            var factory=DocumentBuilderFactory.newInstance();factory.setNamespaceAware(true);
            factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl",true);
            factory.setAttribute(XMLConstants.ACCESS_EXTERNAL_DTD,"");factory.setAttribute(XMLConstants.ACCESS_EXTERNAL_SCHEMA,"");
            var builder=factory.newDocumentBuilder();builder.setErrorHandler(new org.xml.sax.helpers.DefaultHandler(){@Override public void fatalError(org.xml.sax.SAXParseException e)throws org.xml.sax.SAXException{throw e;}});
            Element project=builder.parse(new InputSource(new StringReader(pom.replaceFirst("^\uFEFF","")))).getDocumentElement();
            if(!name(project).equals("project")||!text(project,"modelVersion").equals("4.0.0")||text(project,"artifactId").isBlank())throw new IllegalArgumentException("pom.xml需要有效的Maven project、modelVersion和artifactId。");
            if(child(project,"modules")!=null)throw new IllegalArgumentException("请提交单个可运行服务模块的根目录；暂不支持聚合Maven工程。");
            var parent=child(project,"parent");
            if(parent==null||!text(parent,"groupId").equals("org.springframework.boot")||!text(parent,"artifactId").equals("spring-boot-starter-parent"))throw new IllegalArgumentException("pom.xml需要声明Spring Boot的spring-boot-starter-parent版本。");
            String boot=text(parent,"version");if(!boot.matches("[34]\\.\\d+\\.\\d+"))throw new IllegalArgumentException("请使用Spring Boot 3或4的正式版本号。");
            var properties=new TreeMap<String,String>();var propNode=child(project,"properties");
            if(propNode!=null)for(var entry:children(propNode)){String value=entry.getTextContent().strip();if(!value.matches("[A-Za-z0-9_.+${}-]{1,160}"))throw new IllegalArgumentException("无法准备此Maven属性："+name(entry));properties.put(name(entry),value);}
            int java=Integer.parseInt(properties.getOrDefault("java.version","17"));if(java<17||java>21)throw new IllegalArgumentException("当前检查环境支持JDK17至21，请在本地项目选择相应java.version。");
            var out=new StringBuilder("<project><modelVersion>4.0.0</modelVersion><parent><groupId>org.springframework.boot</groupId><artifactId>spring-boot-starter-parent</artifactId><version>"+boot+"</version><relativePath/></parent><groupId>dev.codesomething.prepare</groupId><artifactId>dependencies</artifactId><version>1</version><properties>");
            properties.forEach((k,v)->out.append('<').append(k).append('>').append(v).append("</").append(k).append('>'));out.append("</properties>");
            for(String section:List.of("dependencies","dependencyManagement")){var node=child(project,section);if(node!=null)out.append(serializeDependencies(node));}
            out.append("<build><plugins><plugin><groupId>org.springframework.boot</groupId><artifactId>spring-boot-maven-plugin</artifactId></plugin>");
            var build=child(project,"build");var plugins=build==null?null:child(build,"plugins");
            if(plugins!=null)for(var plugin:children(plugins)){
                String group=text(plugin,"groupId"),artifact=text(plugin,"artifactId");
                if(artifact.equals("spring-boot-maven-plugin")&&(group.isBlank()||group.equals("org.springframework.boot")))continue;
                if(!(group.isBlank()||group.equals("org.apache.maven.plugins"))||!PLUGINS.contains(artifact))throw new IllegalArgumentException("当前检查环境尚未支持构建插件："+group+":"+artifact);
                out.append("<plugin><groupId>org.apache.maven.plugins</groupId><artifactId>").append(artifact).append("</artifactId>");String version=text(plugin,"version");if(!version.isBlank())out.append("<version>").append(coordinate(version)).append("</version>");out.append("</plugin>");
            }
            out.append("</plugins></build></project>");return new MavenProjectConfig(out.toString());
        }catch(IllegalArgumentException e){throw e;}catch(Exception e){throw new IllegalArgumentException("pom.xml无法解析，请检查Maven配置："+e.getMessage(),e);}
    }
    private static String serializeDependencies(Element node){
        String key=name(node);if(!Set.of("dependencies","dependencyManagement","dependency","groupId","artifactId","version","scope","type","classifier","optional","exclusions","exclusion").contains(key))throw new IllegalArgumentException("暂不支持依赖字段："+key);
        var entries=children(node);StringBuilder out=new StringBuilder("<"+key+">");if(entries.isEmpty()){if(!Set.of("dependencies","dependencyManagement","exclusions").contains(key))out.append(coordinate(node.getTextContent().strip()));}else for(var entry:entries)out.append(serializeDependencies(entry));return out.append("</").append(key).append('>').toString();
    }
    private static String coordinate(String value){if(!value.matches("[A-Za-z0-9_.+${}*,-]{1,200}"))throw new IllegalArgumentException("依赖坐标无效："+value);return value;}
    private static String name(Element node){return node.getLocalName()==null?node.getTagName():node.getLocalName();}
    private static List<Element> children(Element node){var result=new ArrayList<Element>();for(Node item=node.getFirstChild();item!=null;item=item.getNextSibling())if(item instanceof Element e)result.add(e);return result;}
    private static Element child(Element node,String key){return children(node).stream().filter(e->name(e).equals(key)).findFirst().orElse(null);}
    private static String text(Element node,String key){var value=child(node,key);return value==null?"":value.getTextContent().strip();}
}
