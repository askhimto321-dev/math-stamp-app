import { defineConfig } from 'vite';
// GitHub Pages 의 하위 주소(/저장소이름/)에서도 동작하도록 상대 경로로 빌드합니다.
export default defineConfig({ base: './', build: { target: 'es2020' } });
