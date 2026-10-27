import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    id("org.springframework.boot") version "4.1.2"
    id("io.spring.dependency-management") version "1.1.7"
    kotlin("jvm") version "2.3.21"
    kotlin("plugin.spring") version "2.3.21"
}

group = "app.financetracker"
version = "0.1.0"

// Java 17 (Spring Boot 4's minimum). Gradle finds an installed JDK 17, or downloads one
// (see the foojay plugin in settings.gradle.kts), whatever JAVA_HOME points at.
java { toolchain { languageVersion = JavaLanguageVersion.of(17) } }

repositories { mavenCentral() }

dependencies {
    implementation("org.springframework.boot:spring-boot-starter-webmvc")
    implementation("org.springframework.boot:spring-boot-starter-actuator")
    implementation("org.springframework.boot:spring-boot-starter-security-oauth2-client")
    implementation("tools.jackson.module:jackson-module-kotlin")
    implementation("org.jetbrains.kotlin:kotlin-reflect")
    implementation(platform("software.amazon.awssdk:bom:2.56.0"))
    implementation("software.amazon.awssdk:dynamodb") {
        // only the synchronous client is used
        exclude(group = "software.amazon.awssdk", module = "netty-nio-client")
    }
    testImplementation("org.springframework.boot:spring-boot-starter-webmvc-test")
    testImplementation("org.springframework.boot:spring-boot-starter-security-test")
    testImplementation("org.jetbrains.kotlin:kotlin-test-junit5")
    // DynamoDB Local, run in-process by the repository tests: no Docker, no AWS account
    testImplementation("com.amazonaws:DynamoDBLocal:2.6.1")
    testRuntimeOnly("org.junit.platform:junit-platform-launcher")
}

kotlin {
    compilerOptions {
        jvmTarget = JvmTarget.JVM_17
        freeCompilerArgs.addAll("-Xjsr305=strict", "-Xannotation-default-target=param-property")
    }
}

tasks.test { useJUnitPlatform() }

/* ---------- frontend ---------- */

// The Vue app is built with npm and copied into the jar's static resources, so one jar serves
// both the UI and /api. Pass -PskipFrontend to build the backend alone (tests, quick runs).
val frontendDir = rootProject.layout.projectDirectory.dir("frontend")
val skipFrontend = providers.gradleProperty("skipFrontend").isPresent

val npmInstall by tasks.registering(Exec::class) {
    workingDir = frontendDir.asFile
    commandLine("npm", "ci")
    inputs.file(frontendDir.file("package-lock.json"))
    outputs.dir(frontendDir.dir("node_modules"))
}

val npmBuild by tasks.registering(Exec::class) {
    dependsOn(npmInstall)
    workingDir = frontendDir.asFile
    // `build:server` always bundles the sample seed, never seed.local.json
    commandLine("npm", "run", "build:server")
    inputs.dir(frontendDir.dir("src"))
    inputs.files(frontendDir.files("index.html", "vite.config.ts", "package.json", "tsconfig.json", "tsconfig.app.json", "tsconfig.node.json"))
    outputs.dir(frontendDir.dir("dist"))
}

tasks.processResources {
    // The API's in-memory sample data is the same file the frontend ships with.
    from(frontendDir.file("src/data/seed.sample.json")) {
        into("seed")
        rename { "sample.json" }
    }
    if (!skipFrontend) {
        dependsOn(npmBuild)
        from(frontendDir.dir("dist")) { into("static") }
    }
}

// Locally, run against real figures when frontend/src/data/seed.local.json exists (it is gitignored).
tasks.bootRun {
    val local = frontendDir.file("src/data/seed.local.json").asFile
    if (local.exists()) args("--finance.seed=file:${local.absolutePath}")
}
tasks.jar { enabled = false }
