# Etapa 1: Builder - compila la aplicacion con maven
FROM maven:3.9-eclipse-temurin-21 AS build

WORKDIR /app

# copiamos primero el pom.xml para aprovechar el cache de docker
COPY pom.xml .
RUN mvn dependency:go-offline

# copiamos el codigo fuente y compilamos
COPY src ./src
RUN mvn clean package -DskipTests

# Etapa 2: Imagen final, mas liviana, solo para correr la app
FROM eclipse-temurin:21-jre-alpine AS prod

WORKDIR /app

# copiamos solo el jar ya compilado desde la etapa anterior
COPY --from=build /app/target/*.jar app.jar

# creamos un usuario sin privilegios de administrador, mas seguro que correr como root
RUN addgroup -S bankusac && adduser -S bankusac -G bankusac
USER bankusac

EXPOSE 8083

ENTRYPOINT ["java", "-jar", "app.jar"]