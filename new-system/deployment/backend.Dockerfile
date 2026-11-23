FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /build
COPY backend/pom.xml ./
COPY backend/src ./src
RUN --mount=type=cache,target=/root/.m2 mvn -B -ntp -DskipTests package && cp target/codesomething-backend-*.jar /app.jar

FROM docker:29-cli AS docker
FROM eclipse-temurin:21-jre-noble
LABEL codesomething.deployment=true
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*
WORKDIR /app/new-system
COPY --from=docker /usr/local/bin/docker /usr/local/bin/docker
COPY --from=build /app.jar /app/codesomething.jar
COPY course-packs ./course-packs
COPY research ./research
EXPOSE 5188
ENTRYPOINT ["java", "-XX:MaxRAMPercentage=65", "-jar", "/app/codesomething.jar"]
