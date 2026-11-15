# Stage 1: Build Frontend SPA
FROM node:22-alpine AS client-build
WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

# Stage 2: Build .NET Backend
FROM mcr.microsoft.com/dotnet/sdk:10.0-preview-alpine AS server-build
WORKDIR /src
COPY src/Server/SketchTogether.Server.csproj src/Server/
RUN dotnet restore src/Server/SketchTogether.Server.csproj
COPY src/Server/ src/Server/
RUN dotnet publish src/Server/SketchTogether.Server.csproj -c Release -o /app/publish

# Copy built SPA assets into wwwroot for static serving
COPY --from=client-build /app/client/dist /app/publish/wwwroot

# Stage 3: Final Production Runtime
FROM mcr.microsoft.com/dotnet/aspnet:10.0-preview-alpine AS runtime
WORKDIR /app
COPY --from=server-build /app/publish .
ENV ASPNETCORE_URLS=http://+:5248
EXPOSE 5248
ENTRYPOINT ["dotnet", "SketchTogether.Server.dll"]
