#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
#  CTOC - Skills Index Generator
#  Generates skills.json from all skill files in .ctoc/skills/
# ═══════════════════════════════════════════════════════════════════════════════

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CTOC_DIR="$(dirname "$SCRIPT_DIR")"
SKILLS_DIR="$CTOC_DIR/skills"
OUTPUT_FILE="$CTOC_DIR/skills.json"

# ═══════════════════════════════════════════════════════════════════════════════
#  Helper function to get trigger patterns for a language
# ═══════════════════════════════════════════════════════════════════════════════

get_lang_triggers() {
    local lang="$1"
    case "$lang" in
        python) echo '["*.py", "pyproject.toml", "requirements.txt", "setup.py", "Pipfile", "poetry.lock", "uv.lock"]' ;;
        javascript) echo '["*.js", "*.mjs", "*.cjs", "package.json"]' ;;
        typescript) echo '["*.ts", "*.tsx", "tsconfig.json"]' ;;
        rust) echo '["*.rs", "Cargo.toml", "Cargo.lock"]' ;;
        go) echo '["*.go", "go.mod", "go.sum"]' ;;
        java) echo '["*.java", "pom.xml", "build.gradle", "build.gradle.kts"]' ;;
        kotlin) echo '["*.kt", "*.kts", "build.gradle.kts"]' ;;
        swift) echo '["*.swift", "Package.swift"]' ;;
        csharp) echo '["*.cs", "*.csproj", "*.sln"]' ;;
        fsharp) echo '["*.fs", "*.fsx", "*.fsproj"]' ;;
        cpp) echo '["*.cpp", "*.cc", "*.cxx", "*.hpp", "*.h", "CMakeLists.txt"]' ;;
        c) echo '["*.c", "*.h", "Makefile", "CMakeLists.txt"]' ;;
        ruby) echo '["*.rb", "Gemfile", "Gemfile.lock", "Rakefile"]' ;;
        php) echo '["*.php", "composer.json", "composer.lock"]' ;;
        scala) echo '["*.scala", "build.sbt"]' ;;
        elixir) echo '["*.ex", "*.exs", "mix.exs"]' ;;
        erlang) echo '["*.erl", "*.hrl", "rebar.config"]' ;;
        haskell) echo '["*.hs", "*.lhs", "*.cabal", "stack.yaml"]' ;;
        clojure) echo '["*.clj", "*.cljs", "*.cljc", "project.clj", "deps.edn"]' ;;
        dart) echo '["*.dart", "pubspec.yaml", "pubspec.lock"]' ;;
        r) echo '["*.R", "*.Rmd", "DESCRIPTION", "NAMESPACE"]' ;;
        julia) echo '["*.jl", "Project.toml", "Manifest.toml"]' ;;
        lua) echo '["*.lua"]' ;;
        perl) echo '["*.pl", "*.pm", "Makefile.PL", "cpanfile"]' ;;
        bash) echo '["*.sh", "*.bash"]' ;;
        powershell) echo '["*.ps1", "*.psm1", "*.psd1"]' ;;
        sql) echo '["*.sql"]' ;;
        graphql) echo '["*.graphql", "*.gql"]' ;;
        terraform) echo '["*.tf", "*.tfvars"]' ;;
        solidity) echo '["*.sol", "hardhat.config.js", "truffle-config.js", "foundry.toml"]' ;;
        nim) echo '["*.nim", "*.nimble"]' ;;
        crystal) echo '["*.cr", "shard.yml"]' ;;
        zig) echo '["*.zig", "build.zig"]' ;;
        d) echo '["*.d", "dub.json", "dub.sdl"]' ;;
        ocaml) echo '["*.ml", "*.mli", "dune", "dune-project"]' ;;
        groovy) echo '["*.groovy", "*.gradle", "Jenkinsfile"]' ;;
        objectivec) echo '["*.m", "*.mm"]' ;;
        verilog) echo '["*.v", "*.sv"]' ;;
        vhdl) echo '["*.vhd", "*.vhdl"]' ;;
        matlab) echo '["*.m", "*.mat"]' ;;
        fortran) echo '["*.f", "*.f90", "*.f95"]' ;;
        cobol) echo '["*.cob", "*.cbl"]' ;;
        abap) echo '["*.abap"]' ;;
        apex) echo '["*.cls", "*.trigger", "sfdx-project.json"]' ;;
        assembly) echo '["*.asm", "*.s"]' ;;
        coffeescript) echo '["*.coffee"]' ;;
        prolog) echo '["*.pro"]' ;;
        scheme) echo '["*.scm", "*.ss"]' ;;
        tcl) echo '["*.tcl"]' ;;
        vba) echo '["*.vba", "*.bas"]' ;;
        *) echo "[\"*.$lang\"]" ;;
    esac
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Helper function to get keywords for a framework
# ═══════════════════════════════════════════════════════════════════════════════

get_framework_keywords() {
    local name="$1"
    case "$name" in
        # Web Frameworks - Python
        fastapi) echo '["fastapi", "starlette"]' ;;
        django) echo '["django"]' ;;
        flask) echo '["flask"]' ;;
        starlette) echo '["starlette"]' ;;
        tornado) echo '["tornado"]' ;;
        sanic) echo '["sanic"]' ;;
        falcon) echo '["falcon"]' ;;
        bottle) echo '["bottle"]' ;;
        cherrypy) echo '["cherrypy"]' ;;
        litestar) echo '["litestar"]' ;;
        pelican) echo '["pelican"]' ;;

        # Web Frameworks - JavaScript/TypeScript
        react) echo '["react", "react-dom"]' ;;
        nextjs) echo '["next"]' ;;
        vue) echo '["vue"]' ;;
        nuxt) echo '["nuxt"]' ;;
        angular) echo '["@angular/core"]' ;;
        svelte) echo '["svelte"]' ;;
        sveltekit) echo '["@sveltejs/kit"]' ;;
        express) echo '["express"]' ;;
        nestjs) echo '["@nestjs/core"]' ;;
        fastify) echo '["fastify"]' ;;
        koa) echo '["koa"]' ;;
        hapi) echo '["@hapi/hapi"]' ;;
        hono) echo '["hono"]' ;;
        elysia) echo '["elysia"]' ;;
        bun) echo '["bun"]' ;;
        electron) echo '["electron"]' ;;
        solid) echo '["solid-js"]' ;;
        qwik) echo '["@builder.io/qwik"]' ;;
        remix) echo '["@remix-run"]' ;;
        gatsby) echo '["gatsby"]' ;;
        astro) echo '["astro"]' ;;
        preact) echo '["preact"]' ;;
        htmx) echo '["htmx.org"]' ;;
        alpinejs) echo '["alpinejs"]' ;;
        lit) echo '["lit"]' ;;
        stencil) echo '["@stencil/core"]' ;;
        ember) echo '["ember-source"]' ;;
        backbone) echo '["backbone"]' ;;
        knockout) echo '["knockout"]' ;;
        mithril) echo '["mithril"]' ;;
        inferno) echo '["inferno"]' ;;
        marko) echo '["marko"]' ;;
        stimulus) echo '["@hotwired/stimulus"]' ;;
        turbo) echo '["@hotwired/turbo"]' ;;
        inertia) echo '["@inertiajs"]' ;;
        eleventy) echo '["@11ty/eleventy"]' ;;
        hexo) echo '["hexo"]' ;;
        tauri) echo '["tauri", "@tauri-apps"]' ;;

        # Web Frameworks - Ruby
        rails) echo '["rails"]' ;;
        sinatra) echo '["sinatra"]' ;;
        hanami) echo '["hanami"]' ;;
        jekyll) echo '["jekyll"]' ;;

        # Web Frameworks - PHP
        laravel) echo '["laravel/framework"]' ;;
        symfony) echo '["symfony/"]' ;;
        cakephp) echo '["cakephp/cakephp"]' ;;
        codeigniter) echo '["codeigniter4"]' ;;
        slim) echo '["slim/slim"]' ;;
        yii) echo '["yiisoft/yii2"]' ;;
        phalcon) echo '["phalcon"]' ;;

        # Web Frameworks - Java/Kotlin
        spring-boot) echo '["spring-boot", "org.springframework.boot"]' ;;
        quarkus) echo '["quarkus"]' ;;
        micronaut) echo '["micronaut"]' ;;
        dropwizard) echo '["dropwizard"]' ;;
        vertx) echo '["vertx", "io.vertx"]' ;;
        play) echo '["com.typesafe.play"]' ;;
        ratpack) echo '["ratpack"]' ;;
        grails) echo '["grails"]' ;;

        # Web Frameworks - Go
        gin) echo '["gin-gonic/gin"]' ;;
        echo) echo '["labstack/echo"]' ;;
        fiber) echo '["gofiber/fiber"]' ;;
        chi) echo '["go-chi/chi"]' ;;
        mux) echo '["gorilla/mux"]' ;;
        buffalo) echo '["gobuffalo/buffalo"]' ;;
        hugo) echo '["hugo"]' ;;

        # Web Frameworks - Rust
        actix) echo '["actix-web"]' ;;
        axum) echo '["axum"]' ;;
        rocket) echo '["rocket"]' ;;
        warp) echo '["warp"]' ;;
        poem) echo '["poem"]' ;;
        zola) echo '["zola"]' ;;

        # Web Frameworks - Elixir
        phoenix) echo '["phoenix"]' ;;

        # Web Frameworks - .NET
        aspnet-core) echo '["Microsoft.AspNetCore"]' ;;
        blazor) echo '["Microsoft.AspNetCore.Components"]' ;;

        # Mobile Frameworks
        react-native) echo '["react-native"]' ;;
        flutter) echo '["flutter"]' ;;
        expo) echo '["expo"]' ;;
        ionic) echo '["@ionic/"]' ;;
        capacitor) echo '["@capacitor/core"]' ;;
        nativescript) echo '["nativescript", "@nativescript/core"]' ;;
        xamarin) echo '["Xamarin"]' ;;
        maui) echo '["Microsoft.Maui"]' ;;
        swiftui) echo '["SwiftUI"]' ;;
        jetpack-compose) echo '["androidx.compose"]' ;;
        compose-multiplatform) echo '["org.jetbrains.compose"]' ;;
        kivy) echo '["kivy"]' ;;
        beeware) echo '["toga", "briefcase"]' ;;
        unity) echo '["Unity"]' ;;
        unreal) echo '["UnrealEngine"]' ;;

        # Data Frameworks
        prisma) echo '["prisma", "@prisma/client"]' ;;
        drizzle) echo '["drizzle-orm"]' ;;
        sqlalchemy) echo '["sqlalchemy"]' ;;
        alembic) echo '["alembic"]' ;;
        mongodb) echo '["pymongo", "mongodb", "mongoose"]' ;;
        redis) echo '["redis", "ioredis"]' ;;
        elasticsearch) echo '["elasticsearch", "@elastic/elasticsearch"]' ;;
        kafka) echo '["kafka", "confluent-kafka", "kafkajs"]' ;;
        spark) echo '["pyspark", "spark"]' ;;
        pandas) echo '["pandas"]' ;;
        polars) echo '["polars"]' ;;
        numpy) echo '["numpy"]' ;;
        duckdb) echo '["duckdb"]' ;;
        sqlite) echo '["sqlite3", "better-sqlite3"]' ;;
        clickhouse) echo '["clickhouse", "clickhouse-driver"]' ;;
        timescaledb) echo '["timescaledb"]' ;;
        questdb) echo '["questdb"]' ;;
        cassandra) echo '["cassandra-driver"]' ;;
        scylladb) echo '["scylla"]' ;;
        neo4j) echo '["neo4j"]' ;;
        arangodb) echo '["arangojs", "python-arango"]' ;;
        dgraph) echo '["dgraph"]' ;;
        couchbase) echo '["couchbase"]' ;;
        dynamodb) echo '["boto3", "@aws-sdk/client-dynamodb"]' ;;
        memcached) echo '["pymemcache", "memcached"]' ;;
        valkey) echo '["valkey"]' ;;
        meilisearch) echo '["meilisearch"]' ;;
        typesense) echo '["typesense"]' ;;
        opensearch) echo '["opensearch"]' ;;
        supabase) echo '["supabase", "@supabase/supabase-js"]' ;;
        neon) echo '["@neondatabase/serverless"]' ;;
        planetscale) echo '["@planetscale/database"]' ;;
        dbt) echo '["dbt-core", "dbt"]' ;;
        airflow) echo '["apache-airflow", "airflow"]' ;;
        prefect) echo '["prefect"]' ;;
        dagster) echo '["dagster"]' ;;
        flink) echo '["flink", "pyflink"]' ;;
        beam) echo '["apache-beam"]' ;;
        dask) echo '["dask"]' ;;
        vaex) echo '["vaex"]' ;;
        arrow) echo '["pyarrow", "arrow"]' ;;
        great-expectations) echo '["great-expectations", "great_expectations"]' ;;
        snowflake) echo '["snowflake-connector", "snowflake"]' ;;
        trino) echo '["trino"]' ;;
        presto) echo '["presto"]' ;;
        delta-lake) echo '["delta", "delta-spark"]' ;;
        iceberg) echo '["iceberg", "pyiceberg"]' ;;
        hudi) echo '["hudi"]' ;;
        airbyte) echo '["airbyte"]' ;;
        fivetran) echo '["fivetran"]' ;;
        debezium) echo '["debezium"]' ;;
        cockroachdb) echo '["cockroachdb"]' ;;
        adonis) echo '["adonis", "@adonisjs"]' ;;

        # AI/ML Frameworks
        pytorch) echo '["torch", "pytorch"]' ;;
        tensorflow) echo '["tensorflow"]' ;;
        keras) echo '["keras"]' ;;
        scikit-learn) echo '["scikit-learn", "sklearn"]' ;;
        langchain) echo '["langchain"]' ;;
        llamaindex) echo '["llama-index", "llama_index"]' ;;
        transformers) echo '["transformers"]' ;;
        huggingface-hub) echo '["huggingface-hub", "huggingface_hub"]' ;;
        datasets) echo '["datasets"]' ;;
        anthropic-sdk) echo '["anthropic"]' ;;
        openai-sdk) echo '["openai"]' ;;
        ollama) echo '["ollama"]' ;;
        vllm) echo '["vllm"]' ;;
        llama-cpp) echo '["llama-cpp-python", "llama.cpp"]' ;;
        ggml) echo '["ggml"]' ;;
        gradio) echo '["gradio"]' ;;
        streamlit) echo '["streamlit"]' ;;
        fastai) echo '["fastai"]' ;;
        ray) echo '["ray"]' ;;
        deepspeed) echo '["deepspeed"]' ;;
        accelerate) echo '["accelerate"]' ;;
        peft) echo '["peft"]' ;;
        trl) echo '["trl"]' ;;
        bitsandbytes) echo '["bitsandbytes"]' ;;
        unsloth) echo '["unsloth"]' ;;
        mlflow) echo '["mlflow"]' ;;
        wandb) echo '["wandb"]' ;;
        onnx) echo '["onnx", "onnxruntime"]' ;;
        tensorrt) echo '["tensorrt"]' ;;
        triton) echo '["triton", "tritonclient"]' ;;
        jax) echo '["jax", "jaxlib"]' ;;
        diffusers) echo '["diffusers"]' ;;
        chromadb) echo '["chromadb"]' ;;
        pinecone) echo '["pinecone", "pinecone-client"]' ;;
        qdrant) echo '["qdrant-client", "qdrant"]' ;;
        weaviate) echo '["weaviate-client", "weaviate"]' ;;
        milvus) echo '["pymilvus", "milvus"]' ;;
        pgvector) echo '["pgvector"]' ;;
        crewai) echo '["crewai"]' ;;
        autogen) echo '["autogen", "pyautogen"]' ;;
        dspy) echo '["dspy", "dspy-ai"]' ;;
        semantic-kernel) echo '["semantic-kernel"]' ;;
        modal) echo '["modal"]' ;;
        replicate) echo '["replicate"]' ;;

        # DevOps Frameworks
        docker) echo '["docker", "dockerfile"]' ;;
        kubernetes) echo '["kubernetes", "k8s"]' ;;
        helm) echo '["helm"]' ;;
        kustomize) echo '["kustomize"]' ;;
        ansible) echo '["ansible"]' ;;
        puppet) echo '["puppet"]' ;;
        chef) echo '["chef"]' ;;
        saltstack) echo '["salt"]' ;;
        pulumi) echo '["@pulumi", "pulumi"]' ;;
        crossplane) echo '["crossplane"]' ;;
        vault) echo '["hashicorp-vault", "hvac"]' ;;
        prometheus) echo '["prometheus", "prometheus_client"]' ;;
        grafana) echo '["grafana"]' ;;
        datadog) echo '["datadog", "ddtrace"]' ;;
        podman) echo '["podman"]' ;;

        *) echo "[\"$name\"]" ;;
    esac
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Helper function to get requires for a framework
# ═══════════════════════════════════════════════════════════════════════════════

get_framework_requires() {
    local name="$1"
    case "$name" in
        # Python frameworks
        fastapi|django|flask|starlette|tornado|sanic|falcon|bottle|cherrypy|litestar|pelican) echo '["python"]' ;;
        pandas|polars|numpy|duckdb|sqlalchemy|alembic|dbt|airflow|prefect|dagster|dask|vaex|arrow|great-expectations) echo '["python"]' ;;
        pytorch|tensorflow|keras|scikit-learn|langchain|llamaindex|transformers|huggingface-hub|datasets) echo '["python"]' ;;
        anthropic-sdk|openai-sdk|gradio|streamlit|fastai|ray|deepspeed|accelerate|peft|trl|bitsandbytes|unsloth) echo '["python"]' ;;
        mlflow|wandb|jax|diffusers|chromadb|pinecone|qdrant|weaviate|milvus|crewai|autogen|dspy) echo '["python"]' ;;
        kivy|beeware) echo '["python"]' ;;

        # JavaScript/TypeScript frameworks
        react|nextjs|vue|nuxt|svelte|sveltekit|express|fastify|koa|hapi|hono|bun|electron|solid|qwik|remix|gatsby|astro|preact) echo '["javascript", "typescript"]' ;;
        lit|ember|inferno|stimulus|turbo|inertia|prisma|drizzle|react-native|expo|ionic|capacitor|nativescript) echo '["javascript", "typescript"]' ;;

        # TypeScript only
        angular|nestjs|elysia|stencil) echo '["typescript"]' ;;

        # JavaScript only
        htmx|alpinejs|backbone|knockout|mithril|marko|eleventy|hexo) echo '["javascript"]' ;;

        # Ruby frameworks
        rails|sinatra|hanami|jekyll) echo '["ruby"]' ;;

        # PHP frameworks
        laravel|symfony|cakephp|codeigniter|slim|yii|phalcon) echo '["php"]' ;;

        # Java/Kotlin frameworks
        spring-boot|quarkus|micronaut|vertx|ratpack) echo '["java", "kotlin"]' ;;
        dropwizard) echo '["java"]' ;;
        play) echo '["java", "scala"]' ;;
        grails) echo '["groovy"]' ;;

        # Go frameworks
        gin|echo|fiber|chi|mux|buffalo|hugo) echo '["go"]' ;;

        # Rust frameworks
        actix|axum|rocket|warp|poem|zola) echo '["rust"]' ;;
        tauri) echo '["javascript", "typescript", "rust"]' ;;

        # Elixir frameworks
        phoenix) echo '["elixir"]' ;;

        # .NET frameworks
        aspnet-core|blazor|xamarin|maui) echo '["csharp"]' ;;

        # Mobile specific
        flutter) echo '["dart"]' ;;
        swiftui) echo '["swift"]' ;;
        jetpack-compose|compose-multiplatform) echo '["kotlin"]' ;;

        # Default: no specific language requirement
        *) echo '[]' ;;
    esac
}

# ═══════════════════════════════════════════════════════════════════════════════
#  Main Generator Logic - Using jq for proper JSON
# ═══════════════════════════════════════════════════════════════════════════════

generate_index() {
    echo "Generating skills.json..."

    local version
    version=$(date +%Y.%m)
    local generated
    generated=$(date -Iseconds)

    # Build JSON using jq
    local json
    json=$(jq -n \
        --arg version "$version" \
        --arg generated "$generated" \
        '{
            version: $version,
            generated: $generated,
            skills: {
                languages: {},
                frameworks: {
                    "ai-ml": {},
                    "data": {},
                    "devops": {},
                    "mobile": {},
                    "web": {}
                }
            }
        }')

    # Process languages
    for lang_file in "$SKILLS_DIR"/languages/*.md; do
        [[ -f "$lang_file" ]] || continue
        local name
        name=$(basename "$lang_file" .md)
        local size
        size=$(stat -c%s "$lang_file" 2>/dev/null || stat -f%z "$lang_file" 2>/dev/null)
        local triggers
        triggers=$(get_lang_triggers "$name")

        json=$(echo "$json" | jq \
            --arg name "$name" \
            --arg file "languages/$name.md" \
            --argjson triggers "$triggers" \
            --argjson size "$size" \
            '.skills.languages[$name] = {
                file: $file,
                triggers: $triggers,
                size: $size
            }')
    done

    # Process frameworks by category
    for category_dir in "$SKILLS_DIR"/frameworks/*/; do
        [[ -d "$category_dir" ]] || continue
        local category
        category=$(basename "$category_dir")

        for framework_file in "$category_dir"*.md; do
            [[ -f "$framework_file" ]] || continue
            local name
            name=$(basename "$framework_file" .md)
            local size
            size=$(stat -c%s "$framework_file" 2>/dev/null || stat -f%z "$framework_file" 2>/dev/null)
            local keywords
            keywords=$(get_framework_keywords "$name")
            local requires
            requires=$(get_framework_requires "$name")

            json=$(echo "$json" | jq \
                --arg category "$category" \
                --arg name "$name" \
                --arg file "frameworks/$category/$name.md" \
                --argjson keywords "$keywords" \
                --argjson requires "$requires" \
                --argjson size "$size" \
                '.skills.frameworks[$category][$name] = {
                    file: $file,
                    keywords: $keywords,
                    requires: $requires,
                    size: $size
                }')
        done
    done

    # Write output
    echo "$json" | jq '.' > "$OUTPUT_FILE"

    # Validate
    if jq empty "$OUTPUT_FILE" 2>/dev/null; then
        echo "✓ Generated valid skills.json"
        echo "  Location: $OUTPUT_FILE"
        echo "  Languages: $(jq '.skills.languages | length' "$OUTPUT_FILE")"
        echo "  Frameworks: $(jq '[.skills.frameworks[] | length] | add' "$OUTPUT_FILE")"
    else
        echo "✗ Generated JSON is invalid!"
        exit 1
    fi
}

# Check for jq
if ! command -v jq &> /dev/null; then
    echo "Error: jq is required but not installed."
    echo "Install it with: sudo apt install jq (Ubuntu/Debian) or brew install jq (macOS)"
    exit 1
fi

# Run
generate_index
