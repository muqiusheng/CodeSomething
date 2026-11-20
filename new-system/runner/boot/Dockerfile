FROM eclipse-temurin@sha256:4b1a74fbffbe6b4e7b6f0171a472478282fb463790a51edf10e465d578f22b69
COPY maven /opt/maven
COPY repository /opt/repository
COPY settings.xml /opt/settings.xml
RUN chmod -R a+rX /opt/maven /opt/repository && chmod a+r /opt/settings.xml
USER 65534:65534
WORKDIR /tmp
CMD ["sleep", "240"]
